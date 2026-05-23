// GET /api/albums
// Lists distinct top-level album folders under "original/" in the R2 bucket
// and pairs each with a thumbnail key (preferring thumb/<album>/ first object,
// falling back to original/<album>/ first object).
//
// Response: 200 [{ name, thumbnailKey }]

export async function onRequestGet({ env }) {
  const bucket = env.MEDIA_BUCKET;
  if (!bucket) {
    return json({ error: 'MEDIA_BUCKET binding missing' }, 500);
  }

  const albums = [];
  let cursor;
  do {
    const result = await bucket.list({
      prefix: 'original/',
      delimiter: '/',
      cursor,
      limit: 1000,
    });
    for (const prefix of result.delimitedPrefixes || []) {
      const name = prefix.replace(/^original\//, '').replace(/\/$/, '');
      if (!name) continue;

      let thumbnailKey = null;
      const thumbs = await bucket.list({ prefix: `thumb/${name}/`, limit: 1 });
      if (thumbs.objects[0]) {
        thumbnailKey = thumbs.objects[0].key;
      } else {
        const origs = await bucket.list({ prefix: `original/${name}/`, limit: 1 });
        if (origs.objects[0]) thumbnailKey = origs.objects[0].key;
      }
      albums.push({ name, thumbnailKey });
    }
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  albums.sort((a, b) => a.name.localeCompare(b.name));
  return json(albums, 200, { 'Cache-Control': 'no-cache' });
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}
