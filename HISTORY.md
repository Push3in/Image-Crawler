# Image Crawler: project history

Everything built so far, in order, with the decisions and the values chosen. Built on 2026-10-19 in one Claude Code session by Yan (designer, giving feedback) and Claude (writing the code).

## 1. First version: a side panel

- Manifest V3 extension in Chrome's side panel.
- Scans the page for `<img>`, `srcset` (largest candidate), lazy-load attributes, CSS backgrounds, video posters, `og:image`, icons and links to image files, including same-origin iframes (`extract.js`).
- "Scroll page first" option for lazy pages.
- "Crawl site": follows links (same site by default, 20 pages by default) and extracts images from each fetched page.
- Filters by type and minimum size; select and download to `Downloads/Image Crawler/<site>/` (via `chrome.downloads.onDeterminingFilename`).

`extract.js` has survived every redesign since.

## 2. References from Atlas

Using the `/atlas` skill (Atlas's local MCP server):

- Semantic search was off in Atlas, and file names are codes, so searching found nothing useful.
- `get_current_view` showed the **UI** board open; its images were viewed as references → first redesign: masonry grid, hover card with title and dimensions, floating selection bar.
- Yan sent a screenshot of Atlas itself → the definitive layout: justified rows at true proportions, grey dimensions under each image, plain background, shuffle bottom-left, zoom and sort bottom-right.
- The **Interaction** board (screen recordings) was studied for motion. ffmpeg wasn't installed and headless Chrome can't decode video, so frames were pulled with a small Swift/AVFoundation script into contact sheets.

| Reference | Became |
| --- | --- |
| Atlas screenshot | Justified gallery, dimensions-only captions |
| Photo-sorting video | Selected images shrink with a check; dark pill bar with count and actions; thumbnails fly into the bar on download |
| Layout-change video | Zoom, sort, shuffle and filters animate images to new positions |
| Syncing video | Progress toast ("2 of 3 done") with an ⓘ popover listing each file's status |
| Scanning videos | Images fade in one by one into reserved space |

## 3. Side panel → new tab → overlay on the page

- Side panel was too narrow; a new tab took you away from the site. Final: an overlay injected into the current page.
- `background.js` runs `toggleOverlay` with `chrome.scripting.executeScript`: a closed shadow root holding an iframe of `gallery.html` (web-accessible). Falls back to opening a tab on pages extensions can't touch.
- Esc, the ✕, clicking the backdrop or clicking the icon again closes it. Page scroll is locked while open.

Values tuned by eye:

| Detail | Tried | Final |
| --- | --- | --- |
| Panel size | 90% | 95vw × 92vh (left 2.5vw, top 4vh) |
| Panel radius | 40px, 32px | 24px |
| Backdrop | darker | rgba(0,0,0,0.3) + blur(14px) saturate(120%) |
| Header | scrolled with content | fixed 72px, separate from the scroller |
| Gallery background | white | #f2f2f2 (header stays white); `--soft:#e8e8e8`, `--hover:#e0e0e0` |
| Dark mode | supported | removed, always light |

## 4. The gallery

- Justified rows in JS: `ROW_HEIGHTS=[110,160,220,300,420]` (zoom levels), `GAP_X=20`, `ROW_GAP=16`, `CAPTION=30`.
- Photo radius 4px. Dimensions (12px, tabular numbers) under each image.
- Removed: hover title popup (titles were server codes), search, native `<select>` dropdowns (buggy in the overlay → custom menus for type and size; size defaults to "300 px +").
- Click opens the detail view. **Select images** button enters selection mode; then click/Shift-click/⌘A select.
- Selected: image scales to 0.9 with a check (0.95 tried and reverted), no background colour. Snappy transition: `transform .22s cubic-bezier(0.3,1.35,0.5,1)`; no radius transition, no `overflow:hidden` on the frame.
- "Found N images" notice: top centre, 84px from the top (just under the header), springs in and out.
- File size (Finder units, 1 KB = 1000 bytes): shown after the dimensions on one line in grid captions and the detail view title ("1200 × 800 · 245 KB"). Tried a second line under the dimensions in the grid; looked odd, reverted. Size comes from the thumbnail fetch when there is one, else a HEAD request (Content-Length), else the browser cache; looked up as tiles come into view. Unknown → dimensions only.
- Selection bar order: count · Select all · Download · Copy links · Add to Atlas · ✕.
- Selection bar bumps (scale 1.06) only when downloaded images fly into it, not on every selection change (removed as too busy). Instead, on select/unselect the bar's width glides to fit the new text with `SPRING_CLOSE` (~260ms, no overshoot), and disabled buttons fade (opacity 0.2s).

## 5. Detail view (spring morph)

- FLIP: the image is placed at its final rect, then animated from the tile's rect with transform only.
- Spring easing generated as CSS `linear()` by simulating a spring (`springCurve`). Started at stiffness 260 / damping 24; final **open k=600 c=36, close k=600 c=40**.
- Target rect (`viewerTargetRect`): 116px clear at the sides, 100px at the top, bottom = action bar top − 28px, small images enlarged at most 2×.
- Viewer image radius 6px. Shadow on a `::before` pseudo-element that fades with the morph (animating `box-shadow` was laggy).
- Fixes: image overlapped the actions (→ computed target rect); clicks blocked after close (→ `.closing` disables pointer events, opening another tile calls `finishClose()`); shadow appearing late (→ pseudo-element fade); lag (→ no backdrop-filter, transform/opacity only, stiffer springs).
- ← → switch images with a 28px slide + fade. Space previews the hovered tile.

## 6. Performance

- Items are placed as soon as dimensions are known (probe queue, 8 concurrent) so nothing jumps.
- IntersectionObserver lazy loading, `rootMargin` 800px.
- Reveal queue: one image every 30ms (`REVEAL_EVERY_MS`); `img.decode()` raced against 250ms.
- Thumbnails: fetch → `createImageBitmap` (resizeHeight 840) → OffscreenCanvas → WebP blob URL. Skipped for images ≤ 1092px tall, GIFs and SVGs.
- Scroll-back flicker fix: removed `content-visibility:auto` (replayed the fade), added `.settled` so the fade plays once; thumbnails cut decode cost.

## 7. Add to Atlas

- Atlas's MCP server (`http://127.0.0.1:50473/mcp`) refuses requests with a browser Origin header (403), so the extension uses a **native messaging host**: `atlas-bridge/atlas_bridge.py`, host name `com.imagecrawler.atlas`.
- Messages: `add` (urls → `save_media_from_url`, 3 in parallel, per-URL progress), `reveal` (`show_in_app` inbox), `ping`.
- Token read from `*.atlaslibrary/.mcp-token` each time (iCloud Drive, Pictures, Documents, Desktop, home), with a 0600 backup copy written by the installer; tries each token on 401. Opens Atlas with `open -g -a Atlas` if it isn't running.
- `install.sh` copies the helper to `~/Library/Application Support/ImageCrawlerAtlas/`, writes a launcher, caches the token, then `install_hosts.py` registers the host for every Chromium browser it finds (plus Chrome's and Chromium's shared folders), with `allowed_origins` = the extension IDs it finds (absolute-path match or manifest name "Image Crawler"). `--id <store id>` adds a store ID; `STORE_IDS` in `install_hosts.py` can hold it permanently; `--uninstall` removes everything.
- Logs: `~/Library/Logs/ImageCrawler-Atlas.log`.
- The Atlas buttons (`.atlas-btn`) are hidden unless a `ping` succeeds (`body.has-atlas`).
- Progress toast (shared with downloads) springs in and out like the notice: from `translateY(16px) scale(0.96)`, `SPRING_OPEN` / `SPRING_CLOSE`. The check/warning icon pops from `scale(0.4)` with `SPRING_POP` (k=500 c=26, ~9% overshoot, ~475ms). Previously a 0.3s cubic-bezier slide-in and an instant hide.
- Button icon: `icons/atlas.png` (Atlas app icon, 64px). It's another app's trademark; consider replacing it for a public listing.

Debugging in Dia, in order:

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Couldn't reach Atlas" | Direct fetch refused (Origin header) | Native helper |
| "Run the helper once" | Installer only registered Chrome | Auto-discover all Chromium browsers |
| "Atlas helper isn't set up" | Dia reads hosts from Chrome's/Chromium's folders | Register there too |
| "Native host has exited" | Script in `~/Documents`, which macOS blocks for browser-launched programs | Install to Application Support, token backup, logging |
| Reload silently ignored | Added a `key` to the manifest | Removed it; use the path-derived ID |
| Extension failed to load | `__pycache__` inside the extension folder | Run Python with `-B` |
| Brave matched wrong IDs | Relative paths matched the cwd | Only absolute path matches |

## 8. Store prep and hardening (version 2.1.0)

- Removed `activeTab` and `tabs` permissions. Remaining: `scripting`, `downloads`, `clipboardWrite`, `nativeMessaging`, host `<all_urls>`.
- Helper hardening: only http(s) URLs to public hosts (no `file:`, `localhost`, private/loopback IPs, `.local`/`.internal`/`.lan`/`.home.arpa`); max 500 URLs per request (gallery batches by 500), 4096 chars per URL, 1 MB per message; unknown request types rejected.
- Type polish: buttons 14px (pills, selection bar, primary, notice); all `font-weight: 500` → 600. Base text 13px, captions 12px. Font stack: `-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif` (SF Pro on Mac).
- `store/listing.md` (description, category, single purpose, permission justifications, data-use answers), `store/privacy-policy.html` (contact is a placeholder `YOUR-EMAIL@example.com`), `store/screenshots/` (3 × 1280×800, generated art on a fake "Studio North" site), `dist/image-crawler-2.1.0.zip` (10 files).
- Chrome Web Store: new developer accounts can publish 2 extensions at first.
- Pushed to https://github.com/Push3in/Image-Crawler (`main`).
- An article about the design process lives in Claude Docs: "Designing Image Crawler: from a utility to an Atlas-style gallery".

## Still to do

1. Put a real contact email in `store/privacy-policy.html` and host it publicly (e.g. GitHub Pages: Settings → Pages → `main`).
2. Upload `dist/image-crawler-2.1.0.zip` to the Chrome Web Store, filling the listing from `store/listing.md`.
3. After publishing, run `sh atlas-bridge/install.sh --id <store id>` (or add it to `STORE_IDS`).
4. Decide whether to keep Atlas's icon in a public listing.
