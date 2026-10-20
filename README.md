# Image Grab

A Chrome extension (Manifest V3) that shows every image on a page in a clean, Atlas-style gallery so you can pick the ones you want and download them.

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this folder (or **Reload** if it's already installed)
4. Pin the extension, open any page and click its icon

## Using it

Clicking the icon opens the gallery as an overlay on the current page (a white panel, 95% wide and 92% tall) and scans the page. Close it with the ✕, Esc, clicking outside, or clicking the icon again. On pages Chrome doesn't let extensions touch (like `chrome://` pages) it opens in a tab instead and explains why.

- **Gallery**: justified rows, each image at its real proportions, dimensions underneath.
- **Click** an image to open it full size (it springs out of its tile). Use ← → to browse, Esc or click to close.
- **Select images** (top right) switches to selection mode: click to tick images, **Shift-click** for a range, **⌘A** for all. The bottom bar then lets you Download or Copy links. **Cancel** or Esc leaves selection mode.
- Downloads go to `Downloads/Image Grab/<site>/`, with live progress in the corner toast (hover the ⓘ for per-file status).
- **Filters** (top): file type and minimum size (defaults to 300 px + to hide icons).
- **Crawl site**: follows links from the page and adds images from each page it visits.
- **⋯ menu**: scan again, scroll the page to load lazy images, select all, clear.
- **Bottom corners**: shuffle, zoom out / in (also `-` / `+`), sort.

## Add to Atlas

Select images, then **Add to Atlas** (in the selection bar, or in the full-size preview). Atlas downloads each image into its **Inbox**; the corner toast shows progress, and **Show in Atlas** opens the Inbox.

Atlas refuses requests from browsers, so the extension goes through a small local helper in `atlas-bridge/`:

- Set up once: `sh atlas-bridge/install.sh` (needs `python3`). Remove with `sh atlas-bridge/install.sh --uninstall`.
- Store users without this folder: `curl -fsSL https://raw.githubusercontent.com/Push3in/Image-Grab/main/atlas-bridge/get.sh | sh` (the setup page `store/atlas-setup.html` explains it; the gallery's More menu links to it until the helper is installed).
- The helper reads your Atlas key from the library's `.mcp-token` file each time, so no key is stored in the extension. If Atlas isn't running it opens it in the background.
- Only this extension may use the helper: the installer reads the extension's ID from each browser. For a copy installed from the Chrome Web Store, run `sh atlas-bridge/install.sh --id <store id>`.
- The **Add to Atlas** buttons only appear when the helper is installed.
- Images embedded directly in the page (`data:` URLs) can't be sent, since Atlas fetches by web address.

## Publishing

`store/listing.md` has everything for the Chrome Web Store dashboard (description, permission justifications, privacy answers), `store/screenshots/` the 1280×800 screenshots, and `store/privacy-policy.html` the privacy policy to host. Upload `dist/image-grab-<version>.zip`. To rebuild it after changes, bump the version in `manifest.json` and zip `manifest.json`, the `.js`/`.html`/`.css` files and `icons/`.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension config and permissions |
| `background.js` | Toggles the overlay on the current page when you click the toolbar icon |
| `extract.js` | Image and link extraction, shared by the page scan and the crawler |
| `gallery.html/.css/.js` | The gallery, scanning, crawling, selection, downloads and Add to Atlas |
| `atlas-bridge/` | Local helper that forwards images to Atlas, plus its installer |
| `icons/atlas.png` | Atlas's app icon, for the Add to Atlas button |
