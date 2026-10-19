const $ = (id) => document.getElementById(id);

const els = {
  favicon: $('favicon'),
  pageTitle: $('page-title'),
  pageMeta: $('page-meta'),
  typeBtn: $('type-btn'),
  typeMenu: $('type-menu'),
  typeLabel: $('type-label'),
  sizeBtn: $('size-btn'),
  sizeMenu: $('size-menu'),
  sizeLabel: $('size-label'),
  selectMode: $('select-mode'),
  crawlBtn: $('crawl-btn'),
  crawlMenu: $('crawl-menu'),
  crawlStart: $('crawl-start'),
  maxPages: $('max-pages'),
  sameOrigin: $('same-origin'),
  moreBtn: $('more-btn'),
  moreMenu: $('more-menu'),
  scroller: $('scroller'),
  gallery: $('gallery'),
  empty: $('empty'),
  emptyTitle: $('empty-title'),
  emptyText: $('empty-text'),
  shuffle: $('shuffle'),
  zoomIn: $('zoom-in'),
  zoomOut: $('zoom-out'),
  sortBtn: $('sort-btn'),
  sortMenu: $('sort-menu'),
  selectionBar: $('selection-bar'),
  selCount: $('sel-count'),
  selAll: $('sel-all'),
  selDownload: $('sel-download'),
  selAtlas: $('sel-atlas'),
  selCopy: $('sel-copy'),
  selClear: $('sel-clear'),
  notice: $('notice'),
  noticeIcon: $('notice-icon'),
  noticeText: $('notice-text'),
  toast: $('toast'),
  toastIcon: $('toast-icon'),
  toastTitle: $('toast-title'),
  toastSub: $('toast-sub'),
  toastInfo: $('toast-info'),
  toastPop: $('toast-pop'),
  toastAction: $('toast-action'),
  toastClose: $('toast-close'),
  viewer: $('viewer'),
  viewerImg: $('viewer-img'),
  viewerCard: $('viewer-card'),
  viewerBg: $('viewer-bg'),
  viewerBar: $('viewer-bar'),
  viewerTitle: $('viewer-title'),
  viewerMeta: $('viewer-meta'),
  viewerSelect: $('viewer-select'),
  viewerDownload: $('viewer-download'),
  viewerAtlas: $('viewer-atlas'),
  viewerOpen: $('viewer-open'),
  viewerPrev: $('viewer-prev'),
  viewerNext: $('viewer-next'),
  viewerClose: $('viewer-close'),
  closeOverlay: $('close-overlay'),
};

const sourceTabId = Number(new URLSearchParams(location.search).get('tab'));

const ROW_HEIGHTS = [110, 160, 220, 300, 420];
const GAP_X = 20;
const CAPTION = 30;
const ROW_GAP = 16;

const state = {
  source: { url: '', title: '', host: '' },
  byUrl: new Map(), // every url seen, including ones still loading
  items: [],        // items that loaded, in the order they became ready
  visible: [],      // items currently laid out, in display order
  zoom: 2,
  sort: 'found',
  filter: { minSize: 300, type: 'all' },
  lastClicked: null,
  selectMode: false,
  hovered: null,
  viewerIndex: -1,
  scanning: false,
  crawling: false,
  abortCrawl: false,
  scanError: '',
};

const KNOWN_TYPES = new Set(['jpg', 'png', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp', 'tiff']);
const TYPE_ALIASES = { jpeg: 'jpg', 'svg+xml': 'svg', 'x-icon': 'ico', 'vnd.microsoft.icon': 'ico', tif: 'tiff' };

// ---------- helpers ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

function typeOf(url) {
  let ext = url.match(/^data:image\/([a-z0-9.+-]+)/i)?.[1];
  if (!ext) {
    try { ext = new URL(url).pathname.match(/\.([a-z0-9]+)$/i)?.[1]; } catch {}
  }
  ext = (ext || '').toLowerCase();
  ext = TYPE_ALIASES[ext] || ext;
  return KNOWN_TYPES.has(ext) ? ext : 'other';
}

function hostOf(url) {
  if (url.startsWith('data:')) return 'embedded';
  try { return new URL(url).hostname || 'page'; } catch { return 'page'; }
}

const dimsOf = (item) => (item.width ? `${item.width} × ${item.height}` : item.type.toUpperCase());
// How a photo is named in progress lists. Page file names are usually encoded
// server ids, so size and type say more.
const rowName = (item) => (item.width && item.type !== 'other' ? `${dimsOf(item)} · ${item.type.toUpperCase()}` : dimsOf(item));
const ratioOf = (item) => (item.width && item.height ? Math.min(Math.max(item.width / item.height, 0.3), 4) : 1);

// ---------- collecting & probing ----------

function addFound(img, pageUrl) {
  if (state.byUrl.has(img.url)) return false;
  const item = {
    url: img.url,
    alt: img.alt || '',
    width: 0,
    height: 0,
    type: typeOf(img.url),
    page: pageUrl,
    selected: false,
    el: null,
    order: 0,
    shuffleKey: Math.random(),
    broken: false,
  };
  state.byUrl.set(item.url, item);
  // The page scan already measured images that had loaded. Those join the
  // layout straight away as placeholders; only unknown sizes need a probe.
  if (img.width && img.height) {
    item.width = img.width;
    item.height = img.height;
    if (item.width * item.height >= 64) markReady(item); // skip tracking pixels
  } else {
    probeQueue.push(item);
    pumpProbes();
  }
  return true;
}

// Images with unknown sizes (lazy, CSS, crawled) are loaded off-screen first so
// they join the layout at the right proportions. Items join in the order they
// finish, so rows only ever grow at the end instead of reshuffling.
const probeQueue = [];
let probing = 0;

function pumpProbes() {
  while (probing < 8 && probeQueue.length) {
    const item = probeQueue.shift();
    probing++;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      probing--;
      item.width = img.naturalWidth;
      item.height = img.naturalHeight;
      // Skip tracking pixels and spacers.
      if (!item.width || item.width * item.height >= 64) markReady(item);
      pumpProbes();
      onProbeSettled();
    };
    img.onerror = () => {
      probing--;
      pumpProbes();
      onProbeSettled();
    };
    img.src = item.url;
  }
}

function onProbeSettled() {
  if (!probing && !probeQueue.length) updateEmptyState();
}

function markReady(item) {
  item.order = state.items.length;
  state.items.push(item);
  createTile(item);
  scheduleLayout();
}

// ---------- tiles ----------

// Tiles start as grey placeholders. A tile only fetches its photo once it's
// within about a screen of view, and decoded photos are revealed one at a
// time on a steady beat instead of popping in bursts.
const REVEAL_EVERY_MS = 30;
const revealQueue = [];
let revealTimer = 0;

function queueReveal(img) {
  revealQueue.push(img);
  if (revealTimer) return;
  revealTimer = setInterval(() => {
    const img = revealQueue.shift();
    if (img) {
      img.classList.add('loaded');
      // Fade once only; otherwise hiding/showing the tile would replay it.
      img.addEventListener('animationend', () => img.classList.add('settled'), { once: true });
    }
    if (!revealQueue.length) {
      clearInterval(revealTimer);
      revealTimer = 0;
    }
  }, REVEAL_EVERY_MS);
}

const lazyObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    lazyObserver.unobserve(entry.target);
    loadTileImage(entry.target.__item);
  }
}, { root: els.scroller, rootMargin: '800px 0px' });

// Tiles show a resized copy (about 840px tall: the biggest zoom on a 2×
// screen) instead of the original, which may be thousands of pixels wide.
// Small images, GIFs (keep animating) and SVGs use the original as-is.
// Thumbnails are made off the main thread, a few at a time, nearest first.
const THUMB_HEIGHT = 840;
const thumbQueue = [];
let thumbing = 0;

function loadTileImage(item) {
  thumbQueue.push(item);
  pumpThumbs();
}

function pumpThumbs() {
  while (thumbing < 4 && thumbQueue.length) {
    const item = thumbQueue.shift();
    thumbing++;
    thumbnailFor(item)
      .then((src) => showTileImage(item, src))
      .finally(() => {
        thumbing--;
        pumpThumbs();
      });
  }
}

async function thumbnailFor(item) {
  if (item.height <= THUMB_HEIGHT * 1.3 || item.type === 'gif' || item.type === 'svg') return item.url;
  try {
    // Extension pages can fetch any site (host permission), so no CORS taint.
    const blob = await (await fetch(item.url, { credentials: 'include' })).blob();
    const bitmap = await createImageBitmap(blob, { resizeHeight: THUMB_HEIGHT, resizeQuality: 'medium' });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close();
    const thumb = await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 });
    return URL.createObjectURL(thumb);
  } catch {
    return item.url;
  }
}

function showTileImage(item, src) {
  item.thumb = src;
  const img = item.frameEl.querySelector('img');
  img.addEventListener('load', () => {
    // Decode off the main thread before showing, so the reveal never stutters.
    // Capped, so a slow decode can never leave a photo invisible.
    Promise.race([img.decode().catch(() => {}), sleep(250)]).then(() => queueReveal(img));
  }, { once: true });
  img.addEventListener('error', () => {
    item.broken = true;
    scheduleLayout();
  }, { once: true });
  img.src = src;
}

function createTile(item) {
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.__item = item;

  const frame = document.createElement('div');
  frame.className = 'frame';
  const img = document.createElement('img');
  img.decoding = 'async';
  img.alt = item.alt;
  img.draggable = false;
  const check = document.createElement('span');
  check.className = 'check';
  frame.append(img, check);

  const dims = document.createElement('div');
  dims.className = 'dims';
  dims.textContent = dimsOf(item);

  tile.append(frame, dims);
  tile.addEventListener('click', (e) => onTileClick(item, e));
  // Remembered so Space can open the photo under the cursor.
  tile.addEventListener('mouseenter', () => { state.hovered = item; });
  tile.addEventListener('mouseleave', () => { if (state.hovered === item) state.hovered = null; });

  item.el = tile;
  item.frameEl = frame;
  els.gallery.append(tile);
  lazyObserver.observe(tile);
}

function onTileClick(item, e) {
  if (!state.selectMode) {
    openViewer(item);
    return;
  }
  if (e.shiftKey && state.lastClicked && state.visible.includes(state.lastClicked)) {
    const a = state.visible.indexOf(state.lastClicked);
    const b = state.visible.indexOf(item);
    const [from, to] = a < b ? [a, b] : [b, a];
    const value = state.lastClicked.selected;
    for (let i = from; i <= to; i++) setSelected(state.visible[i], value);
  } else {
    setSelected(item, !item.selected);
    state.lastClicked = item;
  }
  updateSelection();
}

function setSelected(item, value) {
  item.selected = value;
  item.el.classList.toggle('selected', value);
}

// ---------- filtering, sorting & layout ----------

function passes(item) {
  const f = state.filter;
  if (item.broken) return false;
  if (f.type !== 'all' && item.type !== f.type) return false;
  if (item.width && Math.min(item.width, item.height) < f.minSize) return false;
  return true;
}

const SORTS = {
  found: (a, b) => a.order - b.order,
  largest: (a, b) => b.width * b.height - a.width * a.height,
  smallest: (a, b) => a.width * a.height - b.width * b.height,
  wide: (a, b) => ratioOf(b) - ratioOf(a),
  tall: (a, b) => ratioOf(a) - ratioOf(b),
  shuffle: (a, b) => a.shuffleKey - b.shuffleKey,
};

let layoutFrame = 0;
function scheduleLayout() {
  if (!layoutFrame) layoutFrame = requestAnimationFrame(() => { layoutFrame = 0; layout(); });
}

// Justified rows: fill each row edge to edge at roughly the target height.
function layout({ animate = false } = {}) {
  if (animate) {
    document.body.classList.add('animating');
    clearTimeout(layout.timer);
    layout.timer = setTimeout(() => document.body.classList.remove('animating'), 500);
  }

  const width = els.gallery.clientWidth;
  const target = ROW_HEIGHTS[state.zoom];
  const shown = new Set();
  state.visible = state.items.filter(passes).sort(SORTS[state.sort]);

  let y = 0;
  let row = [];
  let ratioSum = 0;

  const place = (isLast) => {
    const gaps = GAP_X * (row.length - 1);
    let h = (width - gaps) / ratioSum;
    if (isLast) h = Math.min(h, target);
    let x = 0;
    row.forEach((item, i) => {
      const w = i === row.length - 1 && !isLast ? width - x : Math.round(ratioOf(item) * h);
      positionTile(item, x, y, w, Math.round(h));
      shown.add(item);
      x += w + GAP_X;
    });
    y += Math.round(h) + CAPTION + ROW_GAP;
  };

  for (const item of state.visible) {
    row.push(item);
    ratioSum += ratioOf(item);
    if (ratioSum * target + GAP_X * (row.length - 1) >= width) {
      place(false);
      row = [];
      ratioSum = 0;
    }
  }
  if (row.length) place(true);

  for (const item of state.items) item.el.hidden = !shown.has(item);
  els.gallery.style.height = `${y}px`;
  updateCounts();
  updateSelection();
}

function positionTile(item, x, y, w, h) {
  const tile = item.el;
  tile.style.transform = `translate(${x}px, ${y}px)`;
  tile.style.width = `${w}px`;
  // Explicit height so off-screen tiles (not painted) still have their size.
  tile.style.height = `${h + CAPTION}px`;
  item.frameEl.style.height = `${h}px`;
}

function setFilter(key, value, label, menu, labelEl) {
  state.filter[key] = value;
  labelEl.textContent = label;
  for (const btn of menu.querySelectorAll('button')) btn.classList.toggle('checked', btn.dataset.value === String(value));
  layout({ animate: true });
}

function setZoom(delta) {
  const next = Math.min(Math.max(state.zoom + delta, 0), ROW_HEIGHTS.length - 1);
  if (next === state.zoom) return;
  // Keep the image at the top of the viewport in view while rows reflow.
  const viewTop = els.scroller.getBoundingClientRect().top;
  const anchor = state.visible.find((i) => i.el.getBoundingClientRect().bottom > viewTop);
  state.zoom = next;
  layout({ animate: true });
  if (anchor) {
    const target = parseFloat(anchor.el.style.transform.split(',')[1]) + els.gallery.offsetTop - 8;
    els.scroller.scrollTo({ top: target, behavior: 'smooth' });
  }
  els.zoomIn.disabled = state.zoom === ROW_HEIGHTS.length - 1;
  els.zoomOut.disabled = state.zoom === 0;
}

function setSort(sort) {
  if (sort === 'shuffle') for (const item of state.items) item.shuffleKey = Math.random();
  state.sort = sort;
  for (const btn of els.sortMenu.querySelectorAll('button')) btn.classList.toggle('checked', btn.dataset.sort === sort);
  layout({ animate: true });
}

// ---------- counts, empty state, selection ----------

function updateCounts() {
  const total = state.items.length;
  const shown = state.visible.length;
  const parts = [state.source.host];
  if (total) parts.push(shown === total ? plural(total, 'image') : `${shown.toLocaleString()} of ${plural(total, 'image')}`);
  els.pageMeta.textContent = parts.filter(Boolean).join(' · ');
  updateEmptyState();
}

function updateEmptyState() {
  const loading = state.scanning || probing > 0 || probeQueue.length > 0;
  let title = '';
  let text = '';
  if (state.scanError) {
    title = "Can't read this page";
    text = state.scanError;
  } else if (!state.items.length && !loading) {
    title = 'No images found';
    text = 'Try “Scroll page to load more” or “Crawl site”.';
  } else if (state.items.length && !state.visible.length) {
    title = 'Nothing matches';
    text = 'Try a smaller minimum size or another type.';
  }
  els.empty.hidden = !title;
  els.emptyTitle.textContent = title;
  els.emptyText.textContent = text;
}

const selectedItems = () => state.visible.filter((i) => i.selected);

function updateSelection() {
  const count = selectedItems().length;
  const wasHidden = els.selectionBar.hidden;
  els.selectionBar.hidden = !state.selectMode;
  els.selCount.textContent = count ? `${count.toLocaleString()} selected` : 'Select images';
  els.selAll.textContent = count && count === state.visible.length ? 'Deselect all' : 'Select all';
  els.selDownload.disabled = count === 0;
  els.selAtlas.disabled = count === 0;
  els.selCopy.disabled = count === 0;
  if (!wasHidden && count) {
    els.selectionBar.classList.remove('bump');
    void els.selectionBar.offsetWidth;
    els.selectionBar.classList.add('bump');
  }
}

function selectAll(value) {
  for (const item of state.visible) setSelected(item, value);
  updateSelection();
}

// Clicking a photo opens the preview; in selection mode it ticks it instead.
// Leaving selection mode clears whatever was ticked.
function setSelectMode(on) {
  state.selectMode = on;
  document.body.classList.toggle('select-mode', on);
  els.selectMode.textContent = on ? 'Cancel' : 'Select images';
  els.selectMode.classList.toggle('active', on);
  if (!on) {
    for (const item of state.items) setSelected(item, false);
    state.lastClicked = null;
  }
  updateSelection();
}

// ---------- notice ----------

// Short one-line messages ("Found 154 images") in a pill under the header.
// Springs down into view and back up when it leaves.
const NOTICE_HIDDEN = { opacity: 0, transform: 'translateY(-16px) scale(0.92)' };
const NOTICE_SHOWN = { opacity: 1, transform: 'none' };
let noticeTimer = 0;
let noticeAnim = null;

function showNotice({ icon = 'done', text, autoHide = 2200 }) {
  clearTimeout(noticeTimer);
  els.noticeIcon.className = `toast-icon ${icon}`;
  els.noticeText.textContent = text;
  if (els.notice.hidden || noticeAnim?.leaving) {
    els.notice.hidden = false;
    noticeAnim?.cancel();
    noticeAnim = els.notice.animate([NOTICE_HIDDEN, NOTICE_SHOWN], {
      duration: SPRING_OPEN.duration,
      easing: SPRING_OPEN.easing,
    });
  }
  if (autoHide) noticeTimer = setTimeout(hideNotice, autoHide);
}

function hideNotice() {
  clearTimeout(noticeTimer);
  if (els.notice.hidden || noticeAnim?.leaving) return;
  noticeAnim?.cancel();
  const anim = els.notice.animate([NOTICE_SHOWN, NOTICE_HIDDEN], {
    duration: SPRING_CLOSE.duration,
    easing: SPRING_CLOSE.easing,
    fill: 'forwards',
  });
  anim.leaving = true;
  noticeAnim = anim;
  anim.finished.then(() => {
    if (noticeAnim !== anim) return; // shown again mid-exit
    els.notice.hidden = true;
    anim.cancel();
    noticeAnim = null;
  }).catch(() => {});
}

// ---------- toast ----------

let toastTimer = 0;
let toastOnClose = null;

function showToast({ icon = 'spin', title, sub = '', rows = null, action = null, autoHide = 0, onClose = null }) {
  clearTimeout(toastTimer);
  els.toast.hidden = false;
  els.toastIcon.className = `toast-icon ${icon}`;
  els.toastTitle.textContent = title;
  els.toastSub.textContent = sub;
  els.toastInfo.hidden = !rows?.length;
  if (rows?.length) {
    els.toastPop.replaceChildren(...rows.map(([name, status]) => {
      const row = document.createElement('div');
      row.className = `pop-row ${status.toLowerCase()}`;
      const a = document.createElement('span');
      a.textContent = name;
      const b = document.createElement('span');
      b.textContent = status;
      row.append(a, b);
      return row;
    }));
  }
  els.toastAction.hidden = !action;
  if (action) {
    els.toastAction.textContent = action.label;
    els.toastAction.onclick = action.run;
  }
  toastOnClose = onClose;
  if (autoHide) toastTimer = setTimeout(hideToast, autoHide);
}

function hideToast() {
  clearTimeout(toastTimer);
  els.toast.hidden = true;
}

els.toastClose.addEventListener('click', () => {
  const cb = toastOnClose;
  hideToast();
  cb?.();
});
els.toast.addEventListener('mouseenter', () => clearTimeout(toastTimer));
els.toast.addEventListener('mouseleave', () => {
  if (els.toastIcon.classList.contains('done') || els.toastIcon.classList.contains('warn')) {
    toastTimer = setTimeout(hideToast, 2500);
  }
});

// ---------- scanning the source tab ----------

async function loadSource() {
  try {
    const tab = await chrome.tabs.get(sourceTabId);
    state.source = { url: tab.url || '', title: tab.title || tab.url || '', host: hostOf(tab.url || '') };
    els.pageTitle.textContent = state.source.title;
    els.pageTitle.title = state.source.url;
    if (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://')) els.favicon.src = tab.favIconUrl;
    document.title = `Images · ${state.source.host}`;
    return true;
  } catch {
    els.pageTitle.textContent = 'Page closed';
    state.scanError = 'The original tab was closed. Open the page again and click the extension icon.';
    updateEmptyState();
    return false;
  }
}

async function scanSource({ scroll = false } = {}) {
  if (state.scanning) return;
  state.scanning = true;
  state.scanError = '';
  updateEmptyState();
  showNotice({ icon: 'spin', text: scroll ? 'Scrolling page to load more…' : 'Scanning page…', autoHide: 0 });

  try {
    const target = { tabId: sourceTabId, allFrames: true };
    if (scroll) {
      await chrome.scripting.executeScript({ target: { tabId: sourceTabId }, func: autoScroll });
    }
    const extract = async (t) => {
      await chrome.scripting.executeScript({ target: t, files: ['extract.js'] });
      return chrome.scripting.executeScript({ target: t, func: () => extractImages(document, document.baseURI, true) });
    };
    // Some frames (like this overlay's own) can't be scripted; fall back to the main page.
    const results = await extract(target).catch(() => extract({ tabId: sourceTabId }));
    let added = 0;
    for (const frame of results) {
      for (const img of frame.result || []) if (addFound(img, state.source.url)) added++;
    }
    showNotice({ text: added ? `Found ${plural(added, 'image')}` : 'No new images on this page' });
  } catch (err) {
    hideNotice();
    state.scanError = /cannot be scripted|Cannot access|chrome:\/\//i.test(err.message)
      ? 'Chrome doesn’t allow extensions to read this kind of page.'
      : err.message;
  } finally {
    state.scanning = false;
    updateEmptyState();
  }
}

// Runs inside the page: scrolls down in steps so lazy loaders fire.
async function autoScroll() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const startY = window.scrollY;
  let lastY = -1;
  for (let i = 0; i < 40; i++) {
    window.scrollBy(0, window.innerHeight * 0.9);
    await wait(200);
    if (window.scrollY === lastY) break;
    lastY = window.scrollY;
  }
  await wait(400);
  window.scrollTo(0, startY);
}

// ---------- crawling ----------

async function crawlSite() {
  if (state.crawling) return;
  let start;
  try { start = new URL(state.source.url); } catch { return; }
  if (!/^https?:$/.test(start.protocol)) {
    showNotice({ icon: 'warn', text: 'Crawling only works on websites', autoHide: 3000 });
    return;
  }

  const maxPages = Math.min(Math.max(Number(els.maxPages.value) || 20, 1), 500);
  const sameOrigin = els.sameOrigin.checked;
  state.crawling = true;
  state.abortCrawl = false;
  els.crawlBtn.classList.add('active');
  els.crawlBtn.textContent = 'Crawling…';

  start.hash = '';
  const queue = [start.href];
  const seen = new Set(queue);
  const parser = new DOMParser();
  const log = []; // [path, status] for the toast popover
  let visited = 0;
  let active = 0;
  let added = 0;

  const report = () => showToast({
    title: 'Crawling site',
    sub: `${visited} of ${maxPages} pages · ${plural(added, 'new image')}`,
    rows: log.slice(-12),
    onClose: () => { state.abortCrawl = true; },
  });
  report();

  async function worker() {
    while (!state.abortCrawl && visited < maxPages) {
      const url = queue.shift();
      if (!url) {
        if (active === 0) return;
        await sleep(100);
        continue;
      }
      visited++;
      active++;
      const entry = [new URL(url).pathname || '/', 'Loading'];
      log.push(entry);
      report();
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) {
          entry[1] = 'Skipped';
          continue;
        }
        const doc = parser.parseFromString(await res.text(), 'text/html');
        let found = 0;
        for (const img of extractImages(doc, res.url, false)) {
          if (addFound(img, res.url)) found++;
        }
        added += found;
        entry[1] = found ? `+${found}` : 'Done';
        for (const link of extractLinks(doc, res.url)) {
          if (seen.has(link)) continue;
          if (sameOrigin && new URL(link).origin !== start.origin) continue;
          seen.add(link);
          queue.push(link);
        }
      } catch {
        entry[1] = 'Failed';
      } finally {
        active--;
        if (!state.abortCrawl) report();
      }
    }
  }

  await Promise.all(Array.from({ length: 4 }, worker));

  state.crawling = false;
  els.crawlBtn.classList.remove('active');
  els.crawlBtn.textContent = 'Crawl site';
  showToast({
    icon: 'done',
    title: state.abortCrawl ? 'Crawl stopped' : 'Crawl finished',
    sub: `${plural(visited, 'page')} · ${plural(added, 'new image')}`,
    rows: log.slice(-12),
    autoHide: 4000,
  });
}

// ---------- downloads ----------

// url -> folder, so onDeterminingFilename can file our downloads while keeping
// Chrome's own filename (which includes the right extension from Content-Type).
const pendingFolders = new Map();
const downloadEntries = new Map(); // download id -> job entry
let currentJob = null;

chrome.downloads.onDeterminingFilename.addListener((download, suggest) => {
  const folder = pendingFolders.get(download.url);
  if (!folder) return;
  pendingFolders.delete(download.url);
  const name = download.filename.replace(/[\\/:*?"<>|]+/g, '_');
  suggest({ filename: `${folder}/${name}`, conflictAction: 'uniquify' });
});

chrome.downloads.onChanged.addListener((delta) => {
  const entry = downloadEntries.get(delta.id);
  if (!entry || !delta.state) return;
  if (delta.state.current === 'complete') entry.status = 'Done';
  if (delta.state.current === 'interrupted') entry.status = 'Failed';
  renderDownloadToast();
});

function renderDownloadToast() {
  const job = currentJob;
  if (!job) return;
  const done = job.filter((e) => e.status === 'Done').length;
  const failed = job.filter((e) => e.status === 'Failed').length;
  const rows = job.map((e) => [e.name, e.status]);
  const finished = done + failed === job.length;

  if (!finished) {
    showToast({ title: 'Downloading images', sub: `${done} of ${job.length} done`, rows });
    return;
  }
  const lastId = [...job].reverse().find((e) => e.id && e.status === 'Done')?.id;
  showToast({
    icon: failed ? 'warn' : 'done',
    title: failed ? `${plural(done, 'image')} saved · ${failed} failed` : `${plural(done, 'image')} saved`,
    sub: `Downloads/Image Crawler/${job.folderName}`,
    rows,
    action: lastId ? { label: 'Show in folder', run: () => chrome.downloads.show(lastId) } : null,
    autoHide: 6000,
  });
}

async function downloadItems(items) {
  if (!items.length) return;
  const folderName = state.source.host.replace(/[^\w.-]+/g, '_') || 'images';
  const folder = `Image Crawler/${folderName}`;
  const job = items.map((item) => ({ item, name: rowName(item), status: 'Queued', id: null }));
  job.folderName = folderName;
  currentJob = job;
  renderDownloadToast();

  for (const entry of job) {
    entry.status = 'Loading';
    pendingFolders.set(entry.item.url, folder);
    try {
      entry.id = await chrome.downloads.download({ url: entry.item.url, saveAs: false });
      downloadEntries.set(entry.id, entry);
    } catch {
      pendingFolders.delete(entry.item.url);
      entry.status = 'Failed';
    }
    renderDownloadToast();
  }
}

// Selected thumbnails fly into the selection pill, like dropping into a folder.
function flyToBar(items) {
  const bar = els.selectionBar.getBoundingClientRect();
  const tx = bar.left + bar.width / 2;
  const ty = bar.top + bar.height / 2;
  items
    .filter((item) => {
      const r = item.frameEl.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    })
    .slice(0, 16)
    .forEach((item, i) => {
      const r = item.frameEl.getBoundingClientRect();
      const fly = document.createElement('img');
      fly.className = 'flyer';
      fly.src = item.thumb || item.url;
      Object.assign(fly.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      document.body.append(fly);
      const dx = tx - (r.left + r.width / 2);
      const dy = ty - (r.top + r.height / 2);
      const scale = Math.min(36 / r.width, 36 / r.height);
      fly.animate(
        [
          { transform: 'none', opacity: 1 },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(${(1 + scale) / 2})`, opacity: 1, offset: 0.55 },
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 },
        ],
        { duration: 650, delay: i * 35, easing: 'cubic-bezier(0.5, 0, 0.2, 1)', fill: 'both' },
      ).finished.then(() => fly.remove());
    });
  setTimeout(() => {
    els.selectionBar.classList.remove('bump');
    void els.selectionBar.offsetWidth;
    els.selectionBar.classList.add('bump');
  }, 550);
}

async function copyLinks(items) {
  try {
    await navigator.clipboard.writeText(items.map((i) => i.url).join('\n'));
    showNotice({ text: `Copied ${plural(items.length, 'link')}` });
  } catch (err) {
    showNotice({ icon: 'warn', text: `Couldn’t copy: ${err.message}`, autoHide: 3000 });
  }
}

// ---------- Atlas ----------

// Atlas refuses requests from browsers, so images go through a small local
// helper (atlas-bridge/) that Chrome starts on demand. Atlas downloads each
// URL itself, straight into the Inbox.
const ATLAS_HOST = 'com.imagecrawler.atlas';

function talkToAtlas(message, onProgress) {
  return new Promise((resolve) => {
    // Missing until the extension is reloaded after the permission was added.
    if (typeof chrome.runtime.connectNative !== 'function') {
      resolve({ type: 'error', error: 'Reload Image Crawler in your extensions page to finish setup' });
      return;
    }
    let port;
    try {
      port = chrome.runtime.connectNative(ATLAS_HOST);
    } catch (err) {
      resolve({ type: 'error', error: err.message });
      return;
    }
    let settled = false;
    port.onMessage.addListener((msg) => {
      if (msg.type === 'progress') {
        onProgress?.(msg);
        return;
      }
      settled = true;
      port.disconnect();
      resolve(msg);
    });
    port.onDisconnect.addListener(() => {
      if (!settled) resolve({ type: 'error', error: chrome.runtime.lastError?.message || 'The Atlas helper stopped' });
    });
    port.postMessage(message);
  });
}

function renderAtlasToast(job, finished) {
  const done = job.filter((e) => e.status === 'Done').length;
  const failed = job.filter((e) => e.status === 'Failed').length;
  const rows = job.map((e) => [e.name, e.status]);
  if (!finished) {
    showToast({ title: 'Adding to Atlas', sub: `${done} of ${job.length} added`, rows });
    return;
  }
  showToast({
    icon: failed ? 'warn' : 'done',
    title: failed ? `${plural(done, 'image')} added · ${failed} failed` : `${plural(done, 'image')} added to Atlas`,
    sub: 'Inbox',
    rows,
    action: done ? { label: 'Show in Atlas', run: () => talkToAtlas({ type: 'reveal' }) } : null,
    autoHide: 6000,
  });
}

async function addToAtlas(items) {
  if (!items.length) return;
  const job = items.map((item) => ({ item, name: rowName(item), status: 'Queued' }));
  const byUrl = new Map(job.map((e) => [e.item.url, e]));
  // Atlas fetches by web address, so images embedded in the page can't go.
  for (const e of job) e.status = /^https?:/i.test(e.item.url) ? 'Adding' : 'Failed';
  const urls = job.filter((e) => e.status === 'Adding').map((e) => e.item.url);
  renderAtlasToast(job, false);

  // The helper takes at most 500 links per request.
  let reply = { type: 'done' };
  for (let i = 0; i < urls.length && reply.type !== 'error'; i += 500) {
    reply = await talkToAtlas({ type: 'add', urls: urls.slice(i, i + 500) }, (msg) => {
      const entry = byUrl.get(msg.url);
      if (!entry) return;
      entry.status = msg.ok ? 'Done' : 'Failed';
      renderAtlasToast(job, false);
    });
  }

  if (reply.type === 'error') {
    for (const e of job) if (e.status === 'Adding') e.status = 'Failed';
    const notInstalled = /not found|forbidden/i.test(reply.error);
    showToast({
      icon: 'warn',
      title: notInstalled ? 'Atlas helper isn’t set up' : 'Couldn’t reach Atlas',
      sub: notInstalled ? 'Run atlas-bridge/install.sh once' : reply.error,
      rows: job.map((e) => [e.name, e.status]),
      autoHide: 8000,
    });
    return;
  }
  renderAtlasToast(job, true);
}

// ---------- quick look ----------

// Spring physics baked into a CSS linear() easing so the Web Animations API can
// play it. Stops once the motion is too small to see, so there's no slow tail.
function springCurve({ stiffness, damping, mass = 1 }) {
  const dt = 1 / 120;
  const points = [];
  let x = 0;
  let v = 0;
  for (let i = 0; i < 360; i++) {
    v += ((stiffness * (1 - x) - damping * v) / mass) * dt;
    x += v * dt;
    points.push(x);
    if (Math.abs(1 - x) < 0.002 && Math.abs(v) < 0.02) break;
  }
  const step = Math.max(1, Math.ceil(points.length / 60));
  const stops = points.filter((_, i) => i % step === 0).map((p) => p.toFixed(4));
  return { easing: `linear(0, ${stops.join(', ')}, 1)`, duration: Math.round(points.length * dt * 1000) };
}

// Open: 95% there in ~125ms with a 1.5% overshoot. Close: ~150ms, no bounce.
const SPRING_OPEN = springCurve({ stiffness: 600, damping: 36 });
const SPRING_CLOSE = springCurve({ stiffness: 600, damping: 40 });

let viewerAnim = null;
let shadowAnim = null;
let viewerClosing = false;
let viewerRest = null; // where the card is laid out; every motion is a transform from here

const viewerItem = () => state.visible[state.viewerIndex];

// Largest rect with the item's proportions that fits inside box, centred.
function fitRect(box, item) {
  const ratio = item.width && item.height ? item.width / item.height : box.width / box.height;
  let width = box.width;
  let height = width / ratio;
  if (height > box.height) {
    height = box.height;
    width = height * ratio;
  }
  return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height };
}

// Where the picture is drawn inside its tile (includes the selected inset).
const tileImageRect = (item) => fitRect(item.frameEl.querySelector('img').getBoundingClientRect(), item);

// Resting spot for the preview: below the close button, above the info bar,
// clear of the side arrows, and never more than 2× the image's real size.
function viewerTargetRect(item) {
  // Keep clear of the arrows (68px from each edge), the close button
  // (68px from the top) and the info bar, with breathing room around each.
  const side = window.innerWidth > 760 ? 116 : 24;
  const top = 100;
  const bottom = els.viewerBar.getBoundingClientRect().top - 28;
  let box = { left: side, top, width: window.innerWidth - side * 2, height: bottom - top };
  if (item.width && item.width * 2 < box.width && item.height * 2 < box.height) {
    const w = item.width * 2;
    const h = item.height * 2;
    box = { left: box.left + (box.width - w) / 2, top: box.top + (box.height - h) / 2, width: w, height: h };
  }
  return fitRect(box, item);
}

function placeViewerCard(rect) {
  viewerRest = rect;
  Object.assign(els.viewerCard.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

const rectTransform = (r) =>
  `translate(${r.left - viewerRest.left}px, ${r.top - viewerRest.top}px) scale(${r.width / viewerRest.width}, ${r.height / viewerRest.height})`;

// FLIP on a spring. Only transform and opacity animate, which the GPU
// handles without repainting the image, so it stays smooth on any machine.
// The card keeps its preview size; the tile end is reached by scaling it down,
// and the shadow (its own layer) just fades.
function morph(from, to, spring, shadowFrom, shadowTo) {
  viewerAnim?.cancel();
  shadowAnim?.cancel();
  const timing = { duration: spring.duration, easing: spring.easing, fill: 'both' };
  viewerAnim = els.viewerCard.animate([{ transform: rectTransform(from) }, { transform: rectTransform(to) }], timing);
  shadowAnim = els.viewerCard.animate([{ opacity: shadowFrom }, { opacity: shadowTo }], { ...timing, pseudoElement: '::before' });
  return viewerAnim.finished.catch(() => {});
}

function updateViewerLabels() {
  const item = viewerItem();
  els.viewerTitle.textContent = dimsOf(item);
  els.viewerMeta.textContent = [item.type === 'other' ? null : item.type.toUpperCase(), hostOf(item.url), `${state.viewerIndex + 1} of ${state.visible.length}`]
    .filter(Boolean)
    .join(' · ');
  els.viewerSelect.textContent = item.selected ? 'Selected ✓' : 'Select';
  els.viewerSelect.classList.toggle('active', item.selected);
}

function setViewerItem(index) {
  const count = state.visible.length;
  viewerItem()?.el.classList.remove('ghost');
  state.viewerIndex = (index + count) % count;
  els.viewerImg.src = viewerItem().url;
  updateViewerLabels();
}

async function openViewer(item) {
  const index = state.visible.indexOf(item);
  if (index < 0) return;
  if (viewerClosing) finishClose();
  if (!els.viewer.hidden) return;
  state.viewerIndex = -1;
  setViewerItem(index);
  // The tile already loaded this URL, so decoding is near-instant.
  await Promise.race([els.viewerImg.decode().catch(() => {}), sleep(150)]);

  const from = tileImageRect(item);
  els.viewer.hidden = false;
  const to = viewerTargetRect(item);
  placeViewerCard(to);
  item.el.classList.add('ghost');
  void els.viewer.offsetWidth;
  els.viewer.classList.add('open');
  await morph(from, to, SPRING_OPEN, 0, 1);
}

function stepViewer(delta) {
  if (els.viewer.hidden || viewerClosing) return;
  setViewerItem(state.viewerIndex + delta);
  const item = viewerItem();
  item.el.classList.add('ghost');
  viewerAnim?.cancel();
  shadowAnim?.cancel();
  placeViewerCard(viewerTargetRect(item));
  viewerAnim = els.viewerCard.animate(
    [{ opacity: 0, transform: `translateX(${delta * 28}px)` }, { opacity: 1, transform: 'none' }],
    { duration: SPRING_OPEN.duration, easing: SPRING_OPEN.easing },
  );
}

// Scroll the grid (instantly) so the tile we're closing into is on screen.
function revealTile(item) {
  const r = item.frameEl.getBoundingClientRect();
  const view = els.scroller.getBoundingClientRect();
  if (r.top < view.top + 16 || r.bottom > view.bottom - 16) {
    els.scroller.scrollTop += r.top - view.top - (view.height - r.height) / 2;
  }
}

async function closeViewer() {
  if (els.viewer.hidden || viewerClosing) return;
  viewerClosing = true;
  // Let clicks fall through to the grid while the image flies home, so the
  // next photo can be opened without waiting for the spring to settle.
  els.viewer.classList.add('closing');
  const item = viewerItem();
  // Start from wherever it is right now, so closing mid-open doesn't jump.
  const from = els.viewerCard.getBoundingClientRect();
  const shadowNow = Number(getComputedStyle(els.viewerCard, '::before').opacity);
  revealTile(item);
  const to = tileImageRect(item);
  els.viewer.classList.remove('open');
  await morph(from, to, SPRING_CLOSE, shadowNow, 0);
  // A new photo may have been opened mid-flight; it already tidied up.
  if (viewerClosing) finishClose();
}

function finishClose() {
  viewerItem()?.el.classList.remove('ghost');
  els.viewer.hidden = true;
  els.viewer.classList.remove('closing');
  viewerAnim?.cancel();
  shadowAnim?.cancel();
  viewerAnim = null;
  shadowAnim = null;
  state.viewerIndex = -1;
  viewerClosing = false;
}

// ---------- menus ----------

const menus = [
  [els.typeBtn, els.typeMenu],
  [els.sizeBtn, els.sizeMenu],
  [els.crawlBtn, els.crawlMenu],
  [els.moreBtn, els.moreMenu],
  [els.sortBtn, els.sortMenu],
];

function closeMenus(except) {
  for (const [, menu] of menus) if (menu !== except) menu.hidden = true;
}

for (const [btn, menu] of menus) {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMenus(menu);
    menu.hidden = !menu.hidden;
  });
  menu.addEventListener('click', (e) => e.stopPropagation());
}
document.addEventListener('click', () => closeMenus());

// ---------- wiring ----------

els.typeMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  closeMenus();
  setFilter('type', btn.dataset.value, btn.textContent, els.typeMenu, els.typeLabel);
});
els.sizeMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  closeMenus();
  setFilter('minSize', Number(btn.dataset.value), btn.textContent, els.sizeMenu, els.sizeLabel);
});
els.selectMode.addEventListener('click', () => setSelectMode(!state.selectMode));

els.crawlStart.addEventListener('click', () => { closeMenus(); crawlSite(); });

els.moreMenu.addEventListener('click', (e) => {
  const action = e.target.closest('button')?.dataset.action;
  if (!action) return;
  closeMenus();
  if (action === 'rescan') scanSource();
  if (action === 'deep') scanSource({ scroll: true });
  if (action === 'select-all') {
    setSelectMode(true);
    selectAll(true);
  }
  if (action === 'clear') {
    for (const item of state.items) {
      item.el.remove();
      if (item.thumb?.startsWith('blob:')) URL.revokeObjectURL(item.thumb);
    }
    thumbQueue.length = 0;
    state.items = [];
    state.byUrl.clear();
    probeQueue.length = 0;
    layout();
  }
});

els.sortMenu.addEventListener('click', (e) => {
  const sort = e.target.closest('button')?.dataset.sort;
  if (!sort) return;
  closeMenus();
  setSort(sort);
});

els.shuffle.addEventListener('click', () => setSort('shuffle'));
els.zoomIn.addEventListener('click', () => setZoom(1));
els.zoomOut.addEventListener('click', () => setZoom(-1));

els.selDownload.addEventListener('click', () => {
  const items = selectedItems();
  flyToBar(items);
  downloadItems(items);
});
els.selAtlas.addEventListener('click', () => {
  const items = selectedItems();
  flyToBar(items);
  addToAtlas(items);
});
els.selCopy.addEventListener('click', () => copyLinks(selectedItems()));
els.selAll.addEventListener('click', () => selectAll(!(state.visible.length && state.visible.every((i) => i.selected))));
els.selClear.addEventListener('click', () => setSelectMode(false));

els.viewerPrev.addEventListener('click', () => stepViewer(-1));
els.viewerNext.addEventListener('click', () => stepViewer(1));
els.viewerClose.addEventListener('click', closeViewer);
els.viewerBg.addEventListener('click', closeViewer);
els.viewerCard.addEventListener('click', closeViewer);
els.viewerSelect.addEventListener('click', () => {
  const item = viewerItem();
  if (!state.selectMode) setSelectMode(true);
  setSelected(item, !item.selected);
  updateSelection();
  updateViewerLabels();
});
els.viewerDownload.addEventListener('click', () => downloadItems([viewerItem()]));
els.viewerAtlas.addEventListener('click', () => addToAtlas([viewerItem()]));
els.viewerOpen.addEventListener('click', () => chrome.tabs.create({ url: viewerItem().url }));

els.scroller.addEventListener('scroll', () => {
  document.querySelector('.topbar').classList.toggle('scrolled', els.scroller.scrollTop > 4);
}, { passive: true });

new ResizeObserver(() => scheduleLayout()).observe(els.gallery);
window.addEventListener('resize', () => {
  if (!els.viewer.hidden && !viewerClosing) placeViewerCard(viewerTargetRect(viewerItem()));
});

document.addEventListener('keydown', (e) => {
  const typing = e.target.matches('input, select');
  const viewerOpen = !els.viewer.hidden;

  if (e.key === 'Escape') {
    if (viewerOpen) closeViewer();
    else if (menus.some(([, m]) => !m.hidden)) closeMenus();
    else if (typing) e.target.blur();
    else if (state.selectMode) setSelectMode(false);
    else closeOverlay();
    return;
  }
  if (typing) return;

  if (viewerOpen) {
    if (e.key === 'ArrowLeft') stepViewer(-1);
    else if (e.key === 'ArrowRight') stepViewer(1);
    else if (e.key === ' ') { e.preventDefault(); closeViewer(); }
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
    e.preventDefault();
    setSelectMode(true);
    selectAll(true);
  } else if (e.key === ' ' && state.hovered) {
    e.preventDefault();
    openViewer(state.hovered);
  } else if (e.key === '+' || e.key === '=') {
    setZoom(1);
  } else if (e.key === '-') {
    setZoom(-1);
  }
});

// ---------- overlay ----------

// When shown inside the page overlay, ask the page to remove it. Opened as a
// plain tab (restricted pages), there's nothing to close.
const inOverlay = window.top !== window;
els.closeOverlay.hidden = !inOverlay;

function closeOverlay() {
  if (!inOverlay) return;
  chrome.scripting.executeScript({
    target: { tabId: sourceTabId },
    func: () => document.getElementById('image-crawler-overlay')?.__close?.(),
  }).catch(() => {});
}

els.closeOverlay.addEventListener('click', closeOverlay);

// ---------- Atlas availability ----------

// Add to Atlas only shows up for people who installed the local helper
// (atlas-bridge/). A quick ping tells; without it the buttons stay hidden.
talkToAtlas({ type: 'ping' }).then((reply) => {
  document.body.classList.toggle('has-atlas', reply.type === 'done');
});

// ---------- start ----------

(async () => {
  if (await loadSource()) await scanSource();
})();
