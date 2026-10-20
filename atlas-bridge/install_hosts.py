"""Registers (or removes) the Atlas bridge with every Chromium-based browser.

Finds each browser's user data folder (the one holding "Local State" and a
profile with extensions) under ~/Library/Application Support, so Chrome, Dia,
Arc, Brave, Edge and friends are all covered without a hard-coded list.

The helper is only offered to Image Grab: the ID each browser gave this
folder when it was loaded unpacked (it's derived from the folder's path, so it
stays the same across reloads). Load the extension first, then run this.

Usage: install_hosts.py <launcher path> [--uninstall] [--id <extension id> ...]
"""

import glob
import json
import os
import sys

NAME = "com.imagecrawler.atlas"
# "Image Crawler" was the name before 2.2.0; copies not yet reloaded still show it.
EXTENSION_NAMES = ("Image Grab", "Image Crawler")
# The Chrome Web Store ID, once published, so the store version is always
# allowed. Store installs don't record a folder path to match on, and newer
# browsers may not record the name either. get.sh (the one-line setup on the
# Atlas setup page) relies on this.
STORE_IDS = []
SUPPORT = os.path.expanduser("~/Library/Application Support")
EXTENSION_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def browser_data_dirs():
    found = []
    for local_state in glob.glob(os.path.join(SUPPORT, "**", "Local State"), recursive=True):
        data_dir = os.path.dirname(local_state)
        if data_dir.count(os.sep) - SUPPORT.count(os.sep) > 3:
            continue
        # A browser keeps extensions in its profiles; Electron apps don't.
        if glob.glob(os.path.join(data_dir, "*", "Extensions")):
            found.append(data_dir)
    return sorted(set(found))


def ids_for_this_extension(data_dir):
    ids = set()
    for prefs in glob.glob(os.path.join(data_dir, "*", "*Preferences")):
        try:
            settings = json.load(open(prefs)).get("extensions", {}).get("settings", {})
        except (OSError, ValueError):
            continue
        for ext_id, info in settings.items():
            path = str(info.get("path", ""))
            # Unpacked extensions store an absolute path; store/built-in ones don't.
            if os.path.isabs(path) and os.path.abspath(path) == EXTENSION_DIR:
                ids.add(ext_id)
            # Store installs: match by name when the profile records it.
            elif (info.get("manifest") or {}).get("name") in EXTENSION_NAMES:
                ids.add(ext_id)
    return ids


# Browsers built from Chrome's code (Dia, for one) may look for helpers in
# Chrome's or Chromium's folder instead of their own, so always register there.
SHARED_HOST_DIRS = [
    os.path.join(SUPPORT, "Google", "Chrome", "NativeMessagingHosts"),
    os.path.join(SUPPORT, "Chromium", "NativeMessagingHosts"),
]


def write_host(host_dir, launcher, ids):
    os.makedirs(host_dir, exist_ok=True)
    with open(os.path.join(host_dir, NAME + ".json"), "w") as f:
        json.dump({
            "name": NAME,
            "description": "Sends images from Image Grab to Atlas",
            "path": launcher,
            "type": "stdio",
            "allowed_origins": ["chrome-extension://%s/" % i for i in ids],
        }, f, indent=2)


def main():
    launcher = sys.argv[1]
    uninstall = "--uninstall" in sys.argv[2:]
    data_dirs = browser_data_dirs()
    host_dirs = sorted({os.path.join(d, "NativeMessagingHosts") for d in data_dirs} | set(SHARED_HOST_DIRS))

    if uninstall:
        for host_dir in host_dirs:
            host_file = os.path.join(host_dir, NAME + ".json")
            if os.path.exists(host_file):
                os.remove(host_file)
                print("Removed from:", os.path.relpath(host_dir, SUPPORT))
        return

    # Every ID this extension has in any browser: an unpacked copy's ID can
    # differ between browsers, and a shared folder may be read by several.
    args = sys.argv[2:]
    ids = set(STORE_IDS) | {args[i + 1] for i, a in enumerate(args[:-1]) if a == "--id"}
    for d in data_dirs:
        found = ids_for_this_extension(d)
        if found:
            print("Found Image Grab in %s: %s" % (os.path.relpath(d, SUPPORT), ", ".join(sorted(found))))
        ids |= found
    if not ids:
        print("Image Grab isn't loaded in any browser yet. Load it, then run this again.")
        return
    for host_dir in host_dirs:
        write_host(host_dir, launcher, sorted(ids))
    print("Registered in %d places." % len(host_dirs))


if __name__ == "__main__":
    main()
