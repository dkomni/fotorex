# AGENTS.md — fotorex

Static photo & video gallery for the Greek photography studio **ΦΩΤΟ REX**, hosted on **Cloudflare Pages** with media in **Cloudflare R2**. Public gallery is anonymous; uploads and deletes are guarded by a single shared password.

For end-to-end project context, prefer the existing docs:

- [README.md](README.md) — Cloudflare setup, env vars, R2 token, project layout, endpoints, content-editing guide
- [fotorex-plan.md](fotorex-plan.md) — original architecture & decisions

## Stack snapshot

- **No build step.** Vanilla HTML/CSS/JS ES modules. `wrangler` is the only dev dep.
- **Frontend:** `public/*.html` + `public/css/*.css` + `public/js/*.js`. Served as-is.
- **Backend:** Cloudflare Pages Functions in `functions/api/*.js` (no framework — plain `onRequestGet`/`onRequestPost` handlers).
- **Storage:** R2 bucket bound as `env.MEDIA_BUCKET`. Key layout: `original/<album>/<file>` and `thumb/<album>/<file>.jpg`. Deletes always pair-delete the matching `original` ↔ `thumb`.

## Commands

```powershell
npm install
npm run dev      # wrangler pages dev public  → http://localhost:8788
npm run deploy   # wrangler pages deploy public
```

Local dev needs a gitignored `.dev.vars` with `UPLOAD_PASSWORD`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (see README). Wrangler emulates R2 locally — **the real bucket is not touched** by `npm run dev`. There are no tests; CI in `.github/workflows/main.yml` is a placeholder.

## Project-specific conventions

- **Language is Greek.** All user-facing copy (HTML body text, JS-rendered strings, alert/confirm dialogs) is in Greek. `<html lang="el">` is required on every page.
- **Page template pattern.** Every public page is:
  ```html
  <header class="site-header" data-include="header"></header>
  <main>…page content…</main>
  <footer class="site-footer" data-include="footer"></footer>
  <script src="/js/partials.js" defer></script>
  ```
  [public/js/partials.js](public/js/partials.js) fetches [public/partials/header.html](public/partials/header.html) and [public/partials/footer.html](public/partials/footer.html) and injects them. Do not duplicate nav/footer markup in pages.
- **Design tokens are the single source of truth.** All colors, spacing, type scale, radii, and `@font-face` live in [public/css/tokens.css](public/css/tokens.css). [public/css/style.css](public/css/style.css) only consumes `var(--…)` tokens — never hardcode values there.
- **Editable regions.** HTML content the studio owner is expected to tweak is marked with `<!-- EDITABLE: … -->` comments. Preserve these markers when editing the surrounding markup.
- **Admin auth.** Admin endpoints check the `X-Upload-Password` header via [functions/_shared/auth.js](functions/_shared/auth.js) (constant-time compare against `env.UPLOAD_PASSWORD`). The browser stores the password in `sessionStorage['fotorex_pw']`. No cookies anywhere.
- **Upload paths split by size.** `< 95 MB` → `POST /api/upload` (function body). `> 95 MB` → `POST /api/upload-url` returns a 10-minute SigV4-presigned PUT, browser uploads directly to R2. The presigned path needs the R2 API token env vars and **only works on a deployed preview**, never locally.
- **Privacy posture.** No cookies, no analytics, no third-party trackers. The contact page embeds Google Maps (sets cookies on load) — if you change privacy-affecting things, also update [public/privacy.html](public/privacy.html).
- **Routes are flat .html files.** `/gallery.html`, `/album.html?album=NAME`, `/admin.html`, etc. — no client-side router.

## When adding a new page

1. Copy an existing page (e.g. [public/profile.html](public/profile.html)) for the boilerplate.
2. Add a nav entry in [public/partials/header.html](public/partials/header.html) with the matching `data-path="…"`.
3. Add a footer link in [public/partials/footer.html](public/partials/footer.html).
4. Use existing component classes from `style.css` (`.page-header`, `.section`, `.container`, `.cta-banner`, `.btn`) before inventing new ones.

## When changing a Pages Function

- Don't pull in npm dependencies — these run on Cloudflare Workers runtime (Web APIs only: `fetch`, `crypto.subtle`, `Response`, etc.).
- Validate path segments with `sanitizeSegment`/`sanitizeFilename` (see [functions/api/upload.js](functions/api/upload.js)) before composing R2 keys.
- Return errors as `jsonResponse({ error: '…' }, status)` for consistency with the client.

## Don'ts

- Don't introduce a build/bundler, a framework, or TypeScript — the no-build property is a deliberate constraint.
- Don't commit `.dev.vars`, R2 credentials, or `UPLOAD_PASSWORD`.
- Don't add tracking scripts, cookies, or external font CDNs (fonts are self-hosted under `public/assets/fonts/`).
- Don't break the `/api/file?key=…` Range-request behavior in [functions/api/file.js](functions/api/file.js) — video scrubbing depends on it.
