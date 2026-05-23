// Fullscreen photo / video viewer.
// Exposes window.openLightbox(index). Reads items from window.__fotorex_items
// (populated by gallery.js).
//
// Keyboard: Esc closes, Left/Right navigate.
// Touch: horizontal swipe navigates.

(function () {
  let overlay = null;
  let currentIdx = 0;
  let items = [];
  let touchStartX = null;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'lightbox';
    overlay.innerHTML = `
      <button class="lb-close" type="button" aria-label="Close">×</button>
      <button class="lb-prev" type="button" aria-label="Previous">‹</button>
      <button class="lb-next" type="button" aria-label="Next">›</button>
      <div class="lb-stage" role="dialog" aria-modal="true"></div>
      <div class="lb-caption"></div>
    `;
    document.body.append(overlay);
    overlay.querySelector('.lb-close').addEventListener('click', close);
    overlay.querySelector('.lb-prev').addEventListener('click', (e) => { e.stopPropagation(); prev(); });
    overlay.querySelector('.lb-next').addEventListener('click', (e) => { e.stopPropagation(); next(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.addEventListener('touchstart', (e) => { touchStartX = e.touches[0]?.clientX ?? null; }, { passive: true });
    overlay.addEventListener('touchend', (e) => {
      if (touchStartX === null) return;
      const dx = (e.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
      touchStartX = null;
      if (dx < -50) next();
      else if (dx > 50) prev();
    });
    return overlay;
  }

  function render() {
    items = window.__fotorex_items || [];
    const stage = overlay.querySelector('.lb-stage');
    const caption = overlay.querySelector('.lb-caption');
    stage.innerHTML = '';
    const item = items[currentIdx];
    if (!item) return;
    const src = `/api/file?key=${encodeURIComponent(item.key)}`;
    if (item.type === 'video') {
      const v = document.createElement('video');
      v.src = src;
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      stage.append(v);
    } else {
      const img = document.createElement('img');
      img.src = src;
      img.alt = item.name || '';
      stage.append(img);
    }
    caption.textContent = `${currentIdx + 1} / ${items.length}`;
  }

  function open(idx) {
    ensureOverlay();
    currentIdx = idx;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    render();
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    const stage = overlay.querySelector('.lb-stage');
    if (stage) stage.innerHTML = '';
  }

  function next() {
    if (!items.length) return;
    currentIdx = (currentIdx + 1) % items.length;
    render();
  }

  function prev() {
    if (!items.length) return;
    currentIdx = (currentIdx - 1 + items.length) % items.length;
    render();
  }

  document.addEventListener('keydown', (e) => {
    if (!overlay || !overlay.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  });

  window.openLightbox = open;
})();
