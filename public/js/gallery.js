// Public gallery rendering.
// Mode is decided by the URL: `?album=NAME` renders the media grid for that
// album, otherwise renders the list of albums.

(async function main() {
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const album = params.get('album');
  try {
    if (album) {
      await renderAlbum(app, album);
    } else {
      await renderAlbumsList(app);
    }
  } catch (err) {
    console.error(err);
    app.innerHTML = '<p class="error">Παρουσιάστηκε σφάλμα κατά τη φόρτωση της συλλογής.</p>';
  }
})();

async function renderAlbumsList(app) {
  // The surrounding page (gallery.html) renders the title in its <section class="page-header">,
  // so we only render the grid here.
  app.innerHTML = `
    <div class="grid grid-albums" id="grid">
      <p class="muted">Φόρτωση…</p>
    </div>
  `;
  const grid = document.getElementById('grid');
  const res = await fetch('/api/albums');
  if (!res.ok) throw new Error('albums fetch failed');
  const albums = await res.json();
  grid.innerHTML = '';
  if (!albums.length) {
    grid.innerHTML = '<p class="empty">Δεν υπάρχουν συλλογές ακόμα.</p>';
    return;
  }
  for (const a of albums) {
    const card = document.createElement('a');
    card.className = 'card';
    card.href = `/album.html?album=${encodeURIComponent(a.name)}`;
    const imgWrap = document.createElement('div');
    imgWrap.className = 'card-img';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = a.name;
    img.src = a.thumbnailKey
      ? `/api/file?key=${encodeURIComponent(a.thumbnailKey)}`
      : '/assets/placeholder.svg';
    img.onerror = () => { img.src = '/assets/placeholder.svg'; };
    imgWrap.append(img);
    const label = document.createElement('div');
    label.className = 'card-label';
    label.textContent = a.name;
    card.append(imgWrap, label);
    grid.append(card);
  }
}

async function renderAlbum(app, album) {
  document.title = `${album} — ΦΩΤΟ REX`;
  app.innerHTML = `
    <a class="back-link" href="/gallery.html">&larr; Όλες οι συλλογές</a>
    <h1 class="page-title"></h1>
    <div class="grid grid-media" id="grid">
      <p class="muted">Φόρτωση…</p>
    </div>
  `;
  app.querySelector('.page-title').textContent = album;
  const grid = document.getElementById('grid');
  const res = await fetch(`/api/media?album=${encodeURIComponent(album)}`);
  if (!res.ok) throw new Error('media fetch failed');
  const data = await res.json();
  grid.innerHTML = '';
  if (!data.items?.length) {
    grid.innerHTML = '<p class="empty">Η συλλογή είναι κενή.</p>';
    return;
  }
  // Expose items for the lightbox script.
  window.__fotorex_items = data.items;
  data.items.forEach((item, idx) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile';
    tile.dataset.index = String(idx);
    if (item.type === 'video') {
      const v = document.createElement('video');
      v.src = `/api/file?key=${encodeURIComponent(item.key)}`;
      v.preload = 'metadata';
      v.muted = true;
      v.playsInline = true;
      tile.append(v);
      const play = document.createElement('span');
      play.className = 'play-icon';
      play.textContent = '▶';
      tile.append(play);
    } else {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = item.name;
      img.src = `/api/file?key=${encodeURIComponent(item.thumbKey)}`;
      // Fall back to original if no thumb was generated (e.g. legacy uploads).
      img.onerror = () => {
        if (img.dataset.fallback) return;
        img.dataset.fallback = '1';
        img.src = `/api/file?key=${encodeURIComponent(item.key)}`;
      };
      tile.append(img);
    }
    tile.addEventListener('click', () => {
      if (typeof window.openLightbox === 'function') window.openLightbox(idx);
    });
    grid.append(tile);
  });
}
