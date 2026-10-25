# Image Grab (formerly Image Crawler): project history

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
- Pushed to https://github.com/Push3in/Image-Grab (`main`).
- An article about the design process lives in Claude Docs: "Designing Image Crawler: from a utility to an Atlas-style gallery".

## 9. New app icon and empty states (2026-10-20)

- New red app icon designed by Yan (1024px master, `Icon-Final-V2.png`). Exported at 16, 32, 48, 96 and 128px with Core Image Lanczos plus light luminance sharpening (0.6 at 16px down to 0.15 at 128px). 32 and 96 were added to the manifest because Retina screens draw the 16px toolbar and 48px extensions-page icons at 2×; without them the browser scaled other sizes and blurred them. 16px stays a little soft; only a simplified, pixel-snapped redraw would fix that.
- Empty state centred under the header, styled after Atlas's own ("Your Inbox Is Empty"): Title Case title, one plain sentence. Icon 40px tall in `#b4b4b4`, 16px gap; title 17px/600; message 13px `#8a8a8a`, max 300px. Springs in with `SPRING_OPEN`.
- Four states: Can't Read This Page (`image-slash`), No Images Found (`image`), No Matching Images (`bars-filter` in a hand-drawn circle at Thin's 16-unit weight), Page Closed (`rectangle-xmark`).
- Icons are Font Awesome Pro 7.3.1 **Thin** (Regular and Light felt too heavy), inlined as paths in `EMPTY_ICONS`. Pro is downloaded from `npm.fontawesome.com` with Yan's package token, which is not stored in the repo.

## 10. One store version, with Atlas setup for store users

- Decided on one store listing, not a separate Atlas version: the Atlas buttons already hide without the helper, Google rejects near-duplicate extensions, and new accounts get only 2 extensions.
- `atlas-bridge/get.sh`: one-line setup (`curl … get.sh | sh`) that downloads the helper files from GitHub `main` into a temp folder and runs `install.sh`.
- `store/atlas-setup.html`: setup page (same style as the privacy policy) with copy buttons for install and uninstall, meant for GitHub Pages at `https://push3in.github.io/Image-Grab/store/atlas-setup.html`.
- Gallery: More menu ends with "Use with Atlas…" (opens that page), hidden once the helper answers (`.has-atlas .atlas-setup`). Store description has a "Works with Atlas (optional)" section linking to it.
- Store installs only get a working helper once their ID is in `STORE_IDS` (`install_hosts.py`), since `get.sh` can't find them by folder path.

## 11. Store graphics, Figma screen flows and the new name (version 2.2.0)

- Store graphics designed by Yan in the Figma file "Image Crawler - Icons" (page Design): small promo tile 440×280, marquee 1400×560, four 1280×800 screenshots (the store only accepts 1280×800 or 640×400; 1200×800 was widened by 40 px a side). Exported as JPEG without alpha to `store/promo-tile-440x280.jpg`, `store/marquee-1400x560.jpg` and `store/screenshots/1-gallery.jpg`…`4-select.jpg`. Headlines use Yan's local font Timeless Sans, which Figma's plugin API can't load, so Yan edits that text by hand.
- Page "Screen flows" in the same file: a components board (pills, tiles, menus, notices, toasts, selection bar, empty states, header) and 18 screens at 1200×800 in five flows (browse, crawl, select and download, preview, empty states), filled with Yan's free AI photos. Text is Inter: SF Pro can't be measured through the API (text came out zero width). WebP uploads render blank, so photos were uploaded as JPEG.
- Renamed to **Image Grab** (Glean was considered and dropped: it's an existing company's extension). Visible name, download folder (`Downloads/Image Grab/<site>/`), store text, privacy policy and setup page changed. Internal IDs stay as they were so existing setups keep working: helper `com.imagecrawler.atlas`, `ImageCrawlerAtlas` folder, `ImageCrawler-Atlas.log`, overlay ID. `install_hosts.py` matches both names. The GitHub repo was then renamed to `Push3in/Image-Grab`; GitHub redirects the old repo and raw URLs but not the Pages site, so every link now uses `Image-Grab` (Pages: `https://push3in.github.io/Image-Grab/`). The local folder was renamed to `Image-Grab` too; the unpacked extension ID comes from its path, so after a folder rename load it unpacked again and re-run `install.sh`.
- `dist/image-grab-2.2.0.zip` built.

## 12. Videos (version 2.3.0, 2026-10-25)

- Friends asked for Instagram Reels downloads. Decided against it: Reels, TikTok, YouTube, Vimeo, X, Reddit and Pinterest stream video in pieces through `blob:` addresses (or `.m3u8`/`.mpd` playlists), so there's no single file, and the store bans YouTube downloaders and is strict about saving from social platforms. Those videos still show only their cover image.
- Videos that are one plain file are now found: `<video src>`, `<source src>`, links to `.mp4/.m4v/.webm/.mov/.ogv`, and `og:video` when it points to a file. Such a video's poster becomes its cover instead of a separate image tile.
- Tiles: a `<video>` showing the poster or the frame at 0.1s (`#t=0.1`; the first frame is often black), with a duration badge bottom-left (11px/600, white on rgba(0,0,0,0.5), radius 6px, 8px inset; hidden while selected). Plays muted while hovered. Probes load metadata only; file size from HEAD only (no full download).
- Detail view: plays with sound (falls back to muted), native controls added once the morph lands; clicking the video plays/pauses instead of closing. Meta line adds the length.
- Type menu: Images and Videos under All types; MP4, WebM, MOV in the format list. Counts say "12 images and 2 videos".
- The Select button names what's showing: "Select images", "Select videos", or "Select" when both are visible.
- Tested in headless Chrome with a stubbed `chrome` API (gallery page plus a test page in an iframe, served with HTTP range support, which video seeking needs). Sample clips made with macOS `avconvert` (ffmpeg isn't installed).
- `dist/image-grab-2.3.0.zip` built. Store description, single purpose and `downloads` justification now mention videos (no formats or site names, after the keyword-spam rejection). Submitted to the Chrome Web Store as an update on 2026-10-25.

## Still to do

1. ~~Upload `dist/image-grab-2.2.0.zip` to the Chrome Web Store.~~ Submitted for review on 2026-10-20 (in-depth review expected because of the all-sites host permission). Rejected on 2026-10-22 for "Keyword Spam" (violation "Yellow Argon"): the list of formats "JPG, PNG, GIF, WebP, AVIF, SVG, ICO" in the description. Removed it ("Filter by file type and minimum size"); resubmitted with the new description on 2026-10-22 (same 2.2.0 package), then approved and published. Avoid lists of formats, sites or keywords in store text.
2. ~~Publish 2.3.0 (videos).~~ Submitted for review on 2026-10-25.
3. Now that it's published, add the store ID to `STORE_IDS` in `atlas-bridge/install_hosts.py` and push, so the one-line setup works for store users.
4. Decide whether to keep Atlas's icon in a public listing.
5. Replace the Studio Display frame and Windows wallpaper in the screenshots (other companies' designs).
