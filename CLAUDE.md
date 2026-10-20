# Image Crawler

Chrome/Dia extension (Manifest V3) that shows every image on a page in an Atlas-style gallery overlay, with selection, downloads, site crawling and an optional "Add to Atlas" helper. The full history, decisions and values are in HISTORY.md:

@HISTORY.md

## Working with Yan

- Yan is a designer, not a developer. Explain in plain words, give exact values (px, radius, weights) when asked, and make small visual changes directly.
- Yan browses with **Dia** (Chromium-based), not Chrome. Test assumptions against Dia.
- After any change to the extension, tell Yan to click **Reload** on Image Crawler in Dia's extensions page.

## Setting up on a new Mac

1. `git clone https://github.com/Push3in/Image-Crawler.git`
2. In Dia: extensions page → Developer mode → **Load unpacked** → this folder.
3. For Add to Atlas: open Atlas once, then `sh atlas-bridge/install.sh`. The installer finds the extension's ID in each browser by itself; reload the extension afterwards.

## Pitfalls (learned the hard way)

- Don't add a `key` to `manifest.json`: Dia then silently refuses to reload the unpacked extension.
- Dia looks for native messaging hosts in Chrome's and Chromium's folders (`~/Library/Application Support/Google/Chrome/NativeMessagingHosts`), not only its own.
- A helper started by the browser can't read `~/Documents` (macOS privacy). The helper is installed to `~/Library/Application Support/ImageCrawlerAtlas/`; re-run `install.sh` after changing `atlas_bridge.py`.
- Never leave `__pycache__` in the extension folder: the browser refuses to load folders starting with `_`. Run Python with `-B`.
- Helper log: `~/Library/Logs/ImageCrawler-Atlas.log`.
- Headless Chrome with virtual time stalls `img.decode()` and IntersectionObserver; preview with real time and serve files over a local http server.

## Building the store zip

Bump `version` in `manifest.json`, then from this folder:

```sh
rm -f dist/image-crawler-<version>.zip
zip -q dist/image-crawler-<version>.zip manifest.json background.js extract.js gallery.html gallery.css gallery.js icons/icon16.png icons/icon32.png icons/icon48.png icons/icon96.png icons/icon128.png icons/atlas.png
```

Only those files go in the zip (not `atlas-bridge/`, `store/` or these notes).
