// Shared extraction helpers. Loaded by the side panel (for crawled pages parsed
// with DOMParser) and injected into tabs (for the live page). Uses function
// declarations so repeated injection into the same page doesn't throw.

var IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|bmp|ico|tiff?)(?:[?#]|$)/i;
var SKIP_LINK_EXT = /\.(jpe?g|png|gif|webp|avif|svg|bmp|ico|tiff?|pdf|zip|rar|7z|gz|mp[34]|mov|webm|avi|wav|woff2?|ttf|css|js|json|xml)(?:[?#]|$)/i;
var LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-url', 'data-hi-res-src', 'data-full-src'];
var LAZY_SRCSET_ATTRS = ['srcset', 'data-srcset', 'data-lazy-srcset'];

function extractImages(doc, baseUrl, isLivePage) {
  const found = new Map();

  const baseHref = doc.querySelector('base[href]')?.getAttribute('href');
  if (baseHref) {
    try { baseUrl = new URL(baseHref, baseUrl).href; } catch {}
  }

  function add(raw, source, extra = {}) {
    if (!raw) return;
    raw = String(raw).trim();
    if (!raw || raw.startsWith('blob:') || raw.startsWith('#')) return;
    let url;
    try { url = new URL(raw, baseUrl).href; } catch { return; }
    if (!/^https?:/i.test(url) && !/^data:image\//i.test(url)) return;

    const width = extra.width || 0;
    const height = extra.height || 0;
    const prev = found.get(url);
    if (prev) {
      if (width * height > prev.width * prev.height) {
        prev.width = width;
        prev.height = height;
      }
      if (!prev.alt && extra.alt) prev.alt = extra.alt;
      return;
    }
    found.set(url, { url, source, width, height, alt: extra.alt || '' });
  }

  function addSrcset(srcset, source) {
    if (!srcset) return;
    // Split on comma + whitespace so commas inside URLs survive.
    for (const part of srcset.split(/,\s+/)) add(part.trim().split(/\s+/)[0], source);
  }

  function addCssUrls(text, source, imagesOnly) {
    if (!text || text === 'none') return;
    for (const m of text.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
      const u = m[2];
      if (imagesOnly && !IMAGE_EXT.test(u) && !/^data:image\//i.test(u)) continue;
      add(u, source);
    }
  }

  for (const img of doc.querySelectorAll('img')) {
    const loaded = isLivePage && img.complete && img.naturalWidth > 0;
    const size = loaded ? { width: img.naturalWidth, height: img.naturalHeight } : {};
    if (isLivePage && img.currentSrc) add(img.currentSrc, 'img', { ...size, alt: img.alt });
    add(img.getAttribute('src'), 'img', { ...(isLivePage && img.currentSrc ? {} : size), alt: img.alt });
    for (const attr of LAZY_ATTRS) add(img.getAttribute(attr), 'lazy', { alt: img.alt });
    for (const attr of LAZY_SRCSET_ATTRS) addSrcset(img.getAttribute(attr), 'srcset');
  }

  for (const source of doc.querySelectorAll('picture source, source[srcset]')) {
    for (const attr of LAZY_SRCSET_ATTRS) addSrcset(source.getAttribute(attr), 'srcset');
  }

  for (const el of doc.querySelectorAll('video[poster]')) add(el.getAttribute('poster'), 'poster');
  for (const el of doc.querySelectorAll('input[type="image"][src]')) add(el.getAttribute('src'), 'img');
  for (const el of doc.querySelectorAll('image')) add(el.getAttribute('href') || el.getAttribute('xlink:href'), 'svg');

  for (const meta of doc.querySelectorAll('meta[property="og:image"], meta[property="og:image:url"], meta[name="twitter:image"], meta[itemprop="image"]')) {
    add(meta.getAttribute('content'), 'meta');
  }
  for (const link of doc.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="image_src"]')) {
    add(link.getAttribute('href'), 'icon');
  }

  for (const a of doc.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (IMAGE_EXT.test(href)) add(href, 'link');
  }

  if (isLivePage) {
    // Computed styles catch backgrounds set from stylesheets, not just inline.
    for (const el of doc.querySelectorAll('*')) {
      addCssUrls(getComputedStyle(el).backgroundImage, 'css', false);
    }
  } else {
    for (const el of doc.querySelectorAll('[style]')) addCssUrls(el.getAttribute('style'), 'css', false);
    for (const style of doc.querySelectorAll('style')) addCssUrls(style.textContent, 'css', true);
  }

  return Array.from(found.values());
}

function extractLinks(doc, baseUrl) {
  const links = new Set();
  for (const a of doc.querySelectorAll('a[href]')) {
    let url;
    try { url = new URL(a.getAttribute('href'), baseUrl); } catch { continue; }
    if (!/^https?:$/.test(url.protocol)) continue;
    if (SKIP_LINK_EXT.test(url.pathname)) continue;
    url.hash = '';
    links.add(url.href);
  }
  return Array.from(links);
}
