// Clicking the toolbar icon toggles the gallery overlay on the current page.
chrome.action.onClicked.addListener(async (tab) => {
  const src = chrome.runtime.getURL(`gallery.html?tab=${tab.id}`);
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: toggleOverlay, args: [src] });
  } catch {
    // Pages Chrome won't let extensions touch (chrome://, the Web Store…).
    // The gallery tab explains why nothing can be scanned.
    chrome.tabs.create({ url: src, index: tab.index + 1, openerTabId: tab.id });
  }
});

// Runs inside the page. Lives in a closed shadow root so page CSS can't leak in.
function toggleOverlay(src) {
  const ID = 'image-crawler-overlay';
  const existing = document.getElementById(ID);
  if (existing) {
    existing.__close?.();
    return;
  }

  const host = document.createElement('div');
  host.id = ID;
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      :host { all: initial; position: fixed; inset: 0; z-index: 2147483647; }
      .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(14px) saturate(120%);
        -webkit-backdrop-filter: blur(14px) saturate(120%);
        animation: fade 0.25s ease;
      }
      .panel {
        position: fixed;
        left: 2.5vw;
        top: 4vh;
        width: 95vw;
        height: 92vh;
        background: #fff;
        border-radius: 24px;
        overflow: hidden;
        box-shadow: 0 40px 100px rgba(0, 0, 0, 0.28), 0 8px 24px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04);
        animation: rise 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; color-scheme: light; }
      .closing .backdrop { opacity: 0; transition: opacity 0.2s ease; }
      .closing .panel { opacity: 0; transform: translateY(12px) scale(0.98); transition: opacity 0.2s ease, transform 0.2s ease; }
      @keyframes fade { from { opacity: 0; } }
      @keyframes rise { from { opacity: 0; transform: translateY(18px) scale(0.98); } }
    </style>
    <div class="wrap">
      <div class="backdrop"></div>
      <div class="panel"><iframe allow="clipboard-write"></iframe></div>
    </div>`;

  const iframe = root.querySelector('iframe');
  iframe.src = src;
  iframe.addEventListener('load', () => iframe.focus());

  const html = document.documentElement;
  const prevOverflow = html.style.overflow;
  html.style.overflow = 'hidden';

  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    host.__close = null;
    root.querySelector('.wrap').classList.add('closing');
    html.style.overflow = prevOverflow;
    removeEventListener('keydown', onKey, true);
    setTimeout(() => host.remove(), 200);
  }
  host.__close = close;
  addEventListener('keydown', onKey, true);
  root.querySelector('.backdrop').addEventListener('click', close);
  html.append(host);
}
