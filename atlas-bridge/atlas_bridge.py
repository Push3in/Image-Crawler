"""Image Grab -> Atlas bridge (Chrome native messaging host).

Atlas refuses requests that come from a browser, so the extension can't call
it directly. Chrome starts this script instead and talks to it over stdin /
stdout; the script forwards each image URL to Atlas's local MCP server, which
downloads it into the library (the Inbox unless a collection is given).

The Atlas key is never stored in the extension: it's read from the
`.mcp-token` file inside the Atlas library each time, so regenerating the key
in Atlas just works.

Messages from the extension:
  {"type": "add", "urls": [...], "collection": "Inbox"?}
  {"type": "reveal"}                       -> show the Inbox in Atlas
  {"type": "ping"}                         -> just answers, so the extension
                                              knows the helper is installed
Messages back:
  {"type": "progress", "url": ..., "ok": bool, "error": str?}
  {"type": "done"} / {"type": "error", "error": ...}
"""

import glob
import ipaddress
import json
import os
import struct
import subprocess
import sys
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ENDPOINT = "http://127.0.0.1:50473/mcp"
PARALLEL = 3  # Atlas downloads are slow; a few at once keeps it moving
MAX_URLS = 500
MAX_URL_LENGTH = 4096
MAX_MESSAGE_BYTES = 1024 * 1024
TOKEN_GLOBS = [
    "~/Library/Mobile Documents/com~apple~CloudDocs/*.atlaslibrary/.mcp-token",
    "~/Library/Mobile Documents/com~apple~CloudDocs/*/*.atlaslibrary/.mcp-token",
    "~/Pictures/*.atlaslibrary/.mcp-token",
    "~/Documents/*.atlaslibrary/.mcp-token",
    "~/Desktop/*.atlaslibrary/.mcp-token",
    "~/*.atlaslibrary/.mcp-token",
]

LOG = os.path.expanduser("~/Library/Logs/ImageCrawler-Atlas.log")
# Backup of the key, written by install.sh, for when the browser isn't allowed
# to read the library in iCloud Drive.
TOKEN_CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "token")

write_lock = threading.Lock()


def log(text):
    try:
        with open(LOG, "a") as f:
            f.write("%s  %s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), text))
    except OSError:
        pass


# ---------- Chrome native messaging framing ----------

def read_message():
    header = sys.stdin.buffer.read(4)
    if len(header) < 4:
        return None
    length = struct.unpack("<I", header)[0]
    if length > MAX_MESSAGE_BYTES:
        return None
    return json.loads(sys.stdin.buffer.read(length).decode("utf-8"))


def send(message):
    data = json.dumps(message).encode("utf-8")
    with write_lock:
        sys.stdout.buffer.write(struct.pack("<I", len(data)))
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()


# ---------- Atlas ----------

class AtlasError(Exception):
    pass


def candidate_tokens(include_cache=True):
    paths = []
    for pattern in TOKEN_GLOBS:
        paths.extend(glob.glob(os.path.expanduser(pattern)))
    # Most recently touched library first: usually the one that's open.
    paths.sort(key=os.path.getmtime, reverse=True)
    if include_cache:
        paths.append(TOKEN_CACHE)
    tokens = []
    for path in paths:
        try:
            token = open(path).read().strip()
        except OSError:
            continue
        if token and token not in tokens:
            tokens.append(token)
    return tokens


def post(token, payload, timeout):
    request = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read().decode("utf-8")
    # Plain JSON normally; tolerate a server-sent-events reply too.
    if body.lstrip().startswith(("event:", "data:")):
        lines = [line[5:].strip() for line in body.splitlines() if line.startswith("data:")]
        body = lines[-1] if lines else "{}"
    return json.loads(body)


def ensure_atlas_running():
    """Ping Atlas; if it isn't running, launch it in the background and wait."""
    for attempt in range(12):
        try:
            urllib.request.urlopen(ENDPOINT, timeout=2)
            return
        except urllib.error.HTTPError:
            return  # it answered (with an error for a bare GET) -> it's up
        except (urllib.error.URLError, OSError):
            if attempt == 0:
                subprocess.run(["open", "-g", "-a", "Atlas"], check=False)
            time.sleep(1)
    raise AtlasError("Atlas isn't running and couldn't be opened")


class Atlas:
    def __init__(self):
        self.tokens = candidate_tokens()
        if not self.tokens:
            raise AtlasError("Couldn't find your Atlas library's key (.mcp-token)")
        self.token = None
        self.next_id = 0
        self.id_lock = threading.Lock()

    def call(self, tool, arguments, timeout=180):
        with self.id_lock:
            self.next_id += 1
            request_id = self.next_id
        payload = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": "tools/call",
            "params": {"name": tool, "arguments": arguments},
        }
        tokens = [self.token] if self.token else self.tokens
        for token in tokens:
            try:
                reply = post(token, payload, timeout)
            except urllib.error.HTTPError as err:
                if err.code == 401:
                    continue  # key for another library; try the next one
                if err.code == 403:
                    raise AtlasError("Atlas refused the request (MCP turned off in Settings?)")
                raise AtlasError("Atlas replied HTTP %d" % err.code)
            self.token = token
            if "error" in reply:
                raise AtlasError(reply["error"].get("message", "Atlas error"))
            result = reply.get("result", {})
            text = " ".join(c.get("text", "") for c in result.get("content", []) if c.get("type") == "text")
            if result.get("isError"):
                raise AtlasError(text or "Atlas couldn't save it")
            return text
        raise AtlasError("Atlas rejected the key; re-export it from Atlas Settings > MCP")


# ---------- requests from the extension ----------

def add_images(urls, collection):
    ensure_atlas_running()
    atlas = Atlas()

    def save(url):
        arguments = {"url": url}
        if collection:
            arguments["collection"] = collection
        try:
            atlas.call("save_media_from_url", arguments)
            send({"type": "progress", "url": url, "ok": True})
        except Exception as err:  # report per image, keep going
            log("failed %s: %s" % (url, err))
            send({"type": "progress", "url": url, "ok": False, "error": str(err)})

    with ThreadPoolExecutor(max_workers=PARALLEL) as pool:
        list(pool.map(save, urls))


def reveal():
    ensure_atlas_running()
    Atlas().call("show_in_app", {"view": "inbox"}, timeout=15)


def is_public_web_url(url):
    """Only http(s) links to public sites: nothing on this Mac or the home network."""
    if not isinstance(url, str) or len(url) > MAX_URL_LENGTH:
        return False
    try:
        parts = urllib.parse.urlsplit(url)
    except ValueError:
        return False
    host = (parts.hostname or "").lower()
    if parts.scheme not in ("http", "https") or not host:
        return False
    if host == "localhost" or host.endswith((".localhost", ".local", ".internal", ".lan", ".home.arpa")):
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return "." in host  # a normal domain name
    return address.is_global


def main():
    message = read_message()
    if not isinstance(message, dict):
        return
    kind = message.get("type")
    urls = message.get("urls", [])
    try:
        if kind == "add":
            if not isinstance(urls, list) or len(urls) > MAX_URLS:
                raise AtlasError("Too many images at once (max %d)" % MAX_URLS)
            collection = message.get("collection")
            if collection is not None and not (isinstance(collection, str) and len(collection) <= 200):
                raise AtlasError("Invalid collection name")
            allowed = [url for url in urls if is_public_web_url(url)]
            for url in urls:
                if url not in allowed:
                    send({"type": "progress", "url": url if isinstance(url, str) else "", "ok": False,
                          "error": "Only public web images can be added"})
            log("request: add (%d urls, %d refused)" % (len(urls), len(urls) - len(allowed)))
            add_images(allowed, collection)
        elif kind == "reveal":
            log("request: reveal")
            reveal()
        elif kind != "ping":  # "ping" needs no work: answering "done" is the whole reply.
            raise AtlasError("Unknown request")
        send({"type": "done"})
    except Exception as err:
        log("error: %s\n%s" % (err, traceback.format_exc()))
        send({"type": "error", "error": str(err)})


def cache_token():
    tokens = candidate_tokens(include_cache=False)
    if not tokens:
        print("Couldn't find your Atlas library's key (.mcp-token); the helper will look again each time.")
        return
    fd = os.open(TOKEN_CACHE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(tokens[0])
    print("Saved a backup of your Atlas key.")


if __name__ == "__main__":
    if "--cache-token" in sys.argv:
        cache_token()
    else:
        main()
