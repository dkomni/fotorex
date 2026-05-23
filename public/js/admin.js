// Admin page: password-gated upload + delete UI.
//
// Auth: password is entered once per browser session and kept in sessionStorage.
// It's sent on every authed request via the X-Upload-Password header.
//
// Upload strategy:
//   * Images get a client-side ~400 px JPEG thumbnail before upload.
//   * Files <= 95 MB go through POST /api/upload.
//   * Files >  95 MB request a presigned URL from /api/upload-url and PUT
//     directly to R2 to bypass the Pages Functions request-body limit.

const PASSWORD_KEY = 'fotorex_pw';
const PRESIGN_THRESHOLD = 95 * 1024 * 1024;
const THUMB_MAX = 400;
const SAFE_NAME = /[^a-zA-Z0-9._-]/g;

const app = document.getElementById('app');

(async function init() {
  const pw = sessionStorage.getItem(PASSWORD_KEY);
  if (pw && (await verifyPassword(pw))) {
    renderAdmin();
  } else {
    sessionStorage.removeItem(PASSWORD_KEY);
    renderLogin();
  }
})();

/* ---------------- Auth ---------------- */

async function verifyPassword(pw) {
  try {
    const r = await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Upload-Password': pw },
      body: JSON.stringify({ keys: [] }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function getPassword() {
  return sessionStorage.getItem(PASSWORD_KEY) || '';
}

function renderLogin() {
  app.innerHTML = `
    <section class="auth-box">
      <h1>Sign in</h1>
      <form id="login-form">
        <input type="password" name="pw" placeholder="Password" required autofocus autocomplete="current-password">
        <button type="submit">Enter</button>
        <p class="error" id="login-err" hidden>Incorrect password.</p>
      </form>
    </section>
  `;
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = e.target.pw.value;
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    if (await verifyPassword(pw)) {
      sessionStorage.setItem(PASSWORD_KEY, pw);
      renderAdmin();
    } else {
      document.getElementById('login-err').hidden = false;
      btn.disabled = false;
    }
  });
}

/* ---------------- Admin shell ---------------- */

function renderAdmin() {
  app.innerHTML = `
    <nav class="tabs">
      <button class="tab active" type="button" data-tab="upload">Upload</button>
      <button class="tab" type="button" data-tab="manage">Manage</button>
      <button class="logout" type="button" id="logout">Sign out</button>
    </nav>
    <section id="tab-upload" class="tab-panel"></section>
    <section id="tab-manage" class="tab-panel" hidden></section>
  `;
  document.getElementById('logout').addEventListener('click', () => {
    sessionStorage.removeItem(PASSWORD_KEY);
    renderLogin();
  });
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  renderUploadPanel();
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.getElementById('tab-upload').hidden = name !== 'upload';
  document.getElementById('tab-manage').hidden = name !== 'manage';
  if (name === 'manage') renderManagePanel();
  if (name === 'upload') renderUploadPanel();
}

async function fetchAlbums() {
  try {
    const r = await fetch('/api/albums');
    return r.ok ? r.json() : [];
  } catch {
    return [];
  }
}

/* ---------------- Upload tab ---------------- */

async function renderUploadPanel() {
  const panel = document.getElementById('tab-upload');
  panel.innerHTML = `
    <h2>Upload</h2>
    <div class="form-row">
      <label for="album-select">Album:</label>
      <select id="album-select"><option>Loading…</option></select>
      <input id="album-new" placeholder="New album name" hidden autocomplete="off">
      <button type="button" id="toggle-new" class="link-btn">+ New album</button>
    </div>
    <div id="drop" class="drop-zone" tabindex="0" role="button"
         aria-label="Drop photos or videos, or click to browse">
      <p><strong>Drop photos / videos here</strong></p>
      <p class="muted">or click to choose files</p>
      <input type="file" id="file-input" multiple accept="image/*,video/*" hidden>
    </div>
    <ul id="upload-list" class="upload-list"></ul>
  `;

  const albums = await fetchAlbums();
  const sel = document.getElementById('album-select');
  const newInput = document.getElementById('album-new');
  const toggle = document.getElementById('toggle-new');

  if (albums.length) {
    sel.innerHTML = albums.map((a) => `<option>${escapeHtml(a.name)}</option>`).join('');
  } else {
    sel.innerHTML = '<option value="">(no albums yet)</option>';
    sel.hidden = true;
    newInput.hidden = false;
  }

  toggle.addEventListener('click', () => {
    const showNew = newInput.hidden;
    newInput.hidden = !showNew;
    sel.hidden = showNew;
    if (showNew) newInput.focus();
  });

  const drop = document.getElementById('drop');
  const input = document.getElementById('file-input');
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    handleFiles([...e.dataTransfer.files]);
  });
  input.addEventListener('change', () => {
    handleFiles([...input.files]);
    input.value = '';
  });
}

function getSelectedAlbum() {
  const newInput = document.getElementById('album-new');
  const sel = document.getElementById('album-select');
  const raw = (!newInput.hidden ? newInput.value : sel.value).trim();
  return raw
    .replace(/\s+/g, '-')
    .replace(SAFE_NAME, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

async function handleFiles(files) {
  const album = getSelectedAlbum();
  if (!album) {
    alert('Please select or create an album first.');
    return;
  }
  const list = document.getElementById('upload-list');
  for (const file of files) {
    const li = document.createElement('li');
    li.className = 'upload-item';
    li.innerHTML = `
      <span class="up-name"></span>
      <progress max="100" value="0"></progress>
      <span class="up-status">Pending</span>
    `;
    li.querySelector('.up-name').textContent = file.name;
    list.append(li);
    try {
      await uploadOne(file, album, li);
      li.querySelector('.up-status').textContent = 'Done';
      li.classList.add('done');
    } catch (e) {
      console.error(e);
      li.querySelector('.up-status').textContent = 'Error: ' + e.message;
      li.classList.add('error');
    }
  }
}

async function uploadOne(file, album, li) {
  const progress = li.querySelector('progress');
  const status = li.querySelector('.up-status');
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) throw new Error('Unsupported type');

  const ts = Date.now();
  const safeOriginalName = file.name.replace(SAFE_NAME, '-').replace(/-+/g, '-');
  const baseFilename = `${ts}-${safeOriginalName}`;

  // Thumbnail (images only).
  if (isImage) {
    status.textContent = 'Thumbnail…';
    try {
      const thumb = await makeThumbnail(file, THUMB_MAX);
      if (thumb) {
        const thumbName = stripExt(baseFilename) + '.jpg';
        await putFile({
          blob: thumb,
          contentType: 'image/jpeg',
          album,
          filename: thumbName,
          kind: 'thumb',
        });
      }
    } catch (e) {
      console.warn('Thumbnail failed; uploading original only.', e);
    }
  }

  status.textContent = 'Uploading…';
  await putFile({
    blob: file,
    contentType: file.type,
    album,
    filename: baseFilename,
    kind: 'original',
    onProgress: (pct) => { progress.value = pct; },
  });
}

function stripExt(name) {
  return name.replace(/\.[^.]+$/, '');
}

async function putFile({ blob, contentType, album, filename, kind, onProgress }) {
  if (blob.size > PRESIGN_THRESHOLD) {
    const res = await fetch('/api/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Upload-Password': getPassword() },
      body: JSON.stringify({ album, filename, contentType, kind }),
    });
    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error(err?.error || `Could not get presigned URL (${res.status})`);
    }
    const { url } = await res.json();
    await xhrSend('PUT', url, blob, contentType, null, onProgress);
  } else {
    const url = `/api/upload?album=${encodeURIComponent(album)}` +
                `&filename=${encodeURIComponent(filename)}&kind=${kind}`;
    await xhrSend('POST', url, blob, contentType, getPassword(), onProgress);
  }
}

function xhrSend(method, url, blob, contentType, password, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.setRequestHeader('Content-Type', contentType);
    if (password) xhr.setRequestHeader('X-Upload-Password', password);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress((e.loaded / e.total) * 100);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(blob);
  });
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

function makeThumbnail(file, maxSize) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (blob) resolve(blob);
            else reject(new Error('toBlob failed'));
          },
          'image/jpeg',
          0.82
        );
      } catch (e) {
        URL.revokeObjectURL(objectUrl);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('image decode failed'));
    };
    img.src = objectUrl;
  });
}

/* ---------------- Manage tab ---------------- */

async function renderManagePanel() {
  const panel = document.getElementById('tab-manage');
  panel.innerHTML = '<h2>Manage</h2><div id="albums-list"><p class="muted">Loading…</p></div>';
  const list = document.getElementById('albums-list');
  const albums = await fetchAlbums();
  list.innerHTML = '';
  if (!albums.length) {
    list.innerHTML = '<p class="empty">No albums yet.</p>';
    return;
  }
  for (const a of albums) {
    const section = document.createElement('details');
    section.className = 'album-section';
    section.innerHTML = `
      <summary>
        <span class="album-name"></span>
        <button class="danger" type="button" data-action="delete-album">Delete album</button>
      </summary>
      <div class="album-items"><p class="muted">Loading…</p></div>
    `;
    section.querySelector('.album-name').textContent = a.name;
    list.append(section);

    section.querySelector('button.danger').addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm(`Delete the entire album "${a.name}" and ALL its media?\n\nThis cannot be undone.`)) return;
      if (await deleteAlbum(a.name)) {
        section.remove();
      } else {
        alert('Delete failed.');
      }
    });

    section.addEventListener('toggle', async () => {
      if (!section.open) return;
      const itemsBox = section.querySelector('.album-items');
      if (itemsBox.dataset.loaded) return;
      itemsBox.dataset.loaded = '1';
      const r = await fetch(`/api/media?album=${encodeURIComponent(a.name)}`);
      const data = r.ok ? await r.json() : { items: [] };
      itemsBox.innerHTML = '';
      if (!data.items?.length) {
        itemsBox.innerHTML = '<p class="empty">Empty.</p>';
        return;
      }
      for (const item of data.items) {
        const tile = document.createElement('div');
        tile.className = 'manage-tile';
        if (item.type === 'video') {
          const v = document.createElement('video');
          v.src = `/api/file?key=${encodeURIComponent(item.key)}`;
          v.preload = 'metadata';
          v.muted = true;
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
          img.onerror = () => {
            if (img.dataset.fallback) return;
            img.dataset.fallback = '1';
            img.src = `/api/file?key=${encodeURIComponent(item.key)}`;
          };
          tile.append(img);
        }
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'tile-delete';
        del.textContent = '×';
        del.title = `Delete ${item.name}`;
        del.addEventListener('click', async () => {
          if (!confirm(`Delete ${item.name}?`)) return;
          if (await deleteKeys([item.key])) tile.remove();
          else alert('Delete failed.');
        });
        tile.append(del);
        itemsBox.append(tile);
      }
    });
  }
}

async function deleteKeys(keys) {
  const r = await fetch('/api/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Upload-Password': getPassword() },
    body: JSON.stringify({ keys }),
  });
  return r.ok;
}

async function deleteAlbum(name) {
  const r = await fetch('/api/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Upload-Password': getPassword() },
    body: JSON.stringify({ album: name }),
  });
  return r.ok;
}

/* ---------------- utils ---------------- */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
