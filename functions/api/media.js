// GET /api/media?album=NAME
// Returns all media items in an album under "original/<album>/".
// Each item exposes both the original key and the paired thumb key.
//
// Response: 200 { album, total, items: [{ key, name, size, contentType, type, thumbKey, uploaded }] }

const CT_BY_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4',
};

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const albumParam = url.searchParams.get('album') || '';
  const album = sanitizeAlbum(albumParam);
  if (!album) return json({ error: 'album required' }, 400);

  const bucket = env.MEDIA_BUCKET;
  if (!bucket) return json({ error: 'MEDIA_BUCKET binding missing' }, 500);

  const prefix = `original/${album}/`;
  const items = [];
  let cursor;
  do {
    const result = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const obj of result.objects) {
      const name = obj.key.slice(prefix.length);
      if (!name) continue;
      const contentType =
        obj.httpMetadata?.contentType || guessContentType(name);
      const type = contentType.startsWith('video/') ? 'video' : 'image';
      items.push({
        key: obj.key,
        name,
        size: obj.size,
        contentType,
        type,
        thumbKey: `thumb/${album}/${name.replace(/\.[^.]+$/, '')}.jpg`,
        uploaded: obj.uploaded,
      });
    }
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  // Newest first.
  items.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
  return json({ album, total: items.length, items }, 200, { 'Cache-Control': 'no-cache' });
}

function sanitizeAlbum(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64);
}

function guessContentType(name) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return CT_BY_EXT[ext] || 'application/octet-stream';
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}
