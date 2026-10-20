# Chrome Web Store listing: Image Crawler

Copy each section into the matching field in the Developer Dashboard.

## Store listing tab

**Name** (from manifest.json, can't be changed here)
Image Crawler

**Summary** (from manifest.json, 132 characters max)
See every image on a page in a clean gallery, then pick the ones you want and download them.

**Category**
Productivity › Tools
(Lifestyle › Art & Design also fits if you'd rather reach designers.)

**Language**
English

**Description**

```
Image Crawler shows every image on the page you're viewing in one calm, distraction-free gallery, so you can find the ones you want and save them in a click.

Click the toolbar icon and a gallery opens right on top of the page. Images are laid out edge to edge at their real proportions, with their dimensions underneath, and the page behind is gently blurred.

FIND EVERY IMAGE
• Regular images, high-resolution versions from srcset, lazy-loaded images, CSS backgrounds, video posters, share images and icons
• Images inside frames on the page
• "Scroll page to load more" for pages that only load images as you scroll
• Crawl site: follow links from the page and collect images from each page it visits (stays on the same site by default, up to a page limit you choose)

BROWSE COMFORTABLY
• Justified rows that adapt to your window, with zoom in and out
• Filter by file type (JPG, PNG, GIF, WebP, AVIF, SVG, ICO) and minimum size
• Sort by page order, largest, smallest, widest or tallest, or shuffle
• Click any image to open it full size with a smooth spring animation; use the arrow keys to browse

SAVE WHAT YOU NEED
• Select images to download them in one go, or copy their links
• Shift-click to select a range, ⌘A / Ctrl+A to select everything shown
• Downloads go to Downloads/Image Crawler/<site name>, at original quality
• Live progress for every file

WORKS WITH ATLAS (OPTIONAL)
Use the Atlas image library on your Mac? Add the images you pick straight to it. One-time setup: https://push3in.github.io/Image-Crawler/store/atlas-setup.html

PRIVATE BY DESIGN
Image Crawler works entirely in your browser. It has no account, no analytics and no servers: nothing about you or the pages you visit is collected or sent anywhere.
```

**Screenshots** (1280×800, in this order)
1. `screenshots/1-gallery.png`: the gallery open on a page
2. `screenshots/2-select.png`: selecting images to download
3. `screenshots/3-preview.png`: full-size preview

**Store icon**
`icons/icon128.png` from the extension (128×128).

**Visibility** (Distribution tab)
Unlisted if it's mainly for you (only people with the link can install it), or Public.

---

## Privacy tab

**Single purpose**

```
Image Crawler finds the images on the web page the user is viewing (and, if the user asks, on linked pages of the same site), shows them in a gallery, and lets the user download the ones they choose.
```

**Permission justifications**

Host permission: `<all_urls>`
```
Image Crawler can be opened on any website the user chooses, so it needs access to all sites. It uses this to read the image addresses on the current page when the user clicks the toolbar icon, to load those images into the gallery and the downloads, and, only when the user starts "Crawl site", to fetch linked pages of that site and find their images. It never runs on a page unless the user opens it there.
```

`scripting`
```
Used when the user clicks the toolbar icon to (1) show the gallery on top of the current page and (2) run a small script that lists the images on that page. Nothing is injected into pages the user hasn't opened the gallery on.
```

`downloads`
```
Saves the images the user selects to their Downloads folder (in an "Image Crawler/<site>" subfolder) and shows download progress.
```

`clipboardWrite`
```
Copies the addresses of the selected images to the clipboard when the user clicks "Copy links".
```

`nativeMessaging`
```
Optional integration with the Atlas image library app on the user's Mac. If the user has installed the small companion helper, "Add to Atlas" sends the addresses of the images they selected to that helper, which adds them to their local Atlas library. Without the helper installed this permission is unused and the button doesn't appear. No data leaves the user's computer.
```

**Remote code**
No, I am not using remote code. (All scripts are packaged with the extension.)

**Data usage**
Tick none of the data types. The extension doesn't collect or transmit any user data.

Then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**
Host `store/privacy-policy.html` somewhere public (for example GitHub Pages or any website you own) and paste its address here. Fill in your contact email in the file first.

---

## Package

Upload `dist/image-crawler-2.1.0.zip`.
