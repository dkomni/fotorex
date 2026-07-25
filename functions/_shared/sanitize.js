// Shared sanitization for R2 key segments (album names + filenames).
//
// Album names are shown to visitors (gallery/album titles), so they may
// contain Greek and Latin letters, digits, spaces, and a small set of
// readability punctuation. Filenames are never shown to visitors (they're
// just storage keys prefixed with a timestamp), so they stay ASCII-safe.

const ALBUM_DISALLOWED = /[^\p{L}\p{N} _.,()'-]/gu;

export function sanitizeAlbumName(input) {
  const cleaned = String(input || '')
    .normalize('NFC')
    .replace(ALBUM_DISALLOWED, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  // Guard against names that are only dots (no real traversal risk in R2's
  // flat key namespace, but confusing/pointless as an album name).
  return /^\.+$/.test(cleaned) ? '' : cleaned;
}

export function sanitizeFilename(input) {
  return String(input || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 200);
}
