# Fotorex — Public Gallery + Admin Upload/Delete

A static photo & video gallery hosted on **Cloudflare Pages** with media stored
in **Cloudflare R2**. The gallery is public; uploads and deletions are
password-protected so the client manages all media without developer help.

- **Hosting**: Cloudflare Pages (free tier)
- **Storage**: Cloudflare R2 bucket `fotorex-media`
- **Frontend**: Vanilla HTML/CSS/JS (no build step)
- **API**: Cloudflare Pages Functions (`functions/api/*.js`)
- **URL** (until a custom domain is added): `https://fotorex.pages.dev`

---

## One-time Cloudflare setup

> The R2 bucket `fotorex-media` is already created.

### 1. Create the Pages project

Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.

| Setting               | Value             |
| --------------------- | ----------------- |
| Production branch     | `main`            |
| Build command         | *(leave empty)*   |
| Build output directory| `public`          |

Deploy once — this gives you `https://fotorex.pages.dev`.

### 2. Bind the R2 bucket

Pages project → **Settings → Functions → R2 bucket bindings → Add**:

| Variable name   | R2 bucket       |
| --------------- | --------------- |
| `MEDIA_BUCKET`  | `fotorex-media` |

Add the binding to both **Production** and **Preview**.

### 3. Set environment variables (secrets)

Pages project → **Settings → Environment variables**. All four go into both
*Production* and *Preview*.

| Name                   | Type      | What it is |
| ---------------------- | --------- | ---------- |
| `UPLOAD_PASSWORD`      | Encrypted | The password the client types into `/admin.html` |
| `R2_ACCOUNT_ID`        | Plaintext | Cloudflare account ID (right sidebar of the R2 page) |
| `R2_ACCESS_KEY_ID`     | Encrypted | From an R2 API token (see below) |
| `R2_SECRET_ACCESS_KEY` | Encrypted | From the same R2 API token |

### 4. Create the R2 API token (for large uploads)

R2 supports files up to several GB only when the browser uploads **directly**
to R2 via a presigned URL. The Pages Functions request-body limit is ~100 MB,
which is too small for some videos.

Dashboard → **R2 → Manage R2 API tokens → Create API token**:
- Permission: **Object Read & Write**
- Scope: bucket `fotorex-media`
- TTL: forever (or rotate yearly)

Copy the **Access Key ID** and **Secret Access Key** into the two encrypted
env vars above. The endpoint URL Cloudflare shows is the same one this app
builds internally from `R2_ACCOUNT_ID`.

After saving env vars and bindings, trigger a **redeploy** so the live
functions pick them up.

---

## Local development

```powershell
npm install
npx wrangler login        # one-time
npm run dev               # http://localhost:8788
```

For local dev, create a `.dev.vars` file in the repo root (ignored by git):

```
UPLOAD_PASSWORD=devpassword
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

Local R2 is emulated by Wrangler in a temporary directory; uploads do **not**
hit the real bucket. To test against the real bucket, deploy a Preview build.

---

## Project layout

```
fotorex/
├── public/                     # Static site (served by Pages)
│   ├── index.html              # Public album list
│   ├── album.html              # Public album view
│   ├── admin.html              # Password-protected admin UI
│   ├── css/style.css
│   ├── js/
│   │   ├── gallery.js          # Public list & grid rendering
│   │   ├── lightbox.js         # Fullscreen viewer
│   │   └── admin.js            # Auth, upload, manage/delete
│   └── assets/placeholder.svg
├── functions/
│   ├── _shared/
│   │   ├── auth.js             # Constant-time password check
│   │   └── r2-presign.js       # AWS SigV4 presigned PUT URL builder
│   └── api/
│       ├── albums.js           # GET  /api/albums
│       ├── media.js            # GET  /api/media?album=NAME
│       ├── file.js             # GET  /api/file?key=KEY  (with Range support)
│       ├── upload.js           # POST /api/upload        (<=95 MB)
│       ├── upload-url.js       # POST /api/upload-url    (presigned, >95 MB)
│       └── delete.js           # POST /api/delete        (files or whole album)
├── wrangler.toml
├── package.json
├── fotorex-plan.md             # Architecture & decisions
├── CLIENT-GUIDE.md             # End-user instructions
└── README.md
```

### R2 key layout

```
original/<album>/<timestamp>-<sanitized-name>.<ext>    # full-size source
thumb/<album>/<timestamp>-<sanitized-name>.jpg         # ~400px JPEG generated in-browser
```

Deletion of any item always pair-deletes its `original` ↔ `thumb` counterpart.

---

## Endpoints

| Method | Path             | Auth | Description |
| ------ | ---------------- | ---- | ----------- |
| GET    | `/api/albums`    | —    | List albums + each album's thumbnail key |
| GET    | `/api/media?album=NAME` | — | List media in an album |
| GET    | `/api/file?key=KEY` | — | Stream object from R2 (supports HTTP Range) |
| POST   | `/api/upload?album=NAME&filename=FILE&kind=original\|thumb` | `X-Upload-Password` | Direct upload, ≤95 MB. Body = raw file bytes. |
| POST   | `/api/upload-url` | `X-Upload-Password` | Returns a 10-minute presigned PUT URL the browser uses for large files. |
| POST   | `/api/delete`    | `X-Upload-Password` | `{ keys: [...] }` or `{ album: "name" }` |

---

## Deployment workflow after first setup

Pages auto-deploys on every push to `main`. There is no build step.

If only static files (HTML/CSS/JS) changed, the deploy is essentially instant.
If `functions/` changed, the Pages Functions are rebuilt and rolled out
together with the static assets.

---

## Client handoff

When you're ready to hand over the account:

1. **Add the client's payment card** in Cloudflare → Manage Account → Billing.
2. **Set their card as default**, then remove yours.
3. Set a billing notification (Billing → Notifications, e.g. \$1) so any
   unexpected charge produces an email immediately.
4. Hand over the account email + password, and the `UPLOAD_PASSWORD` you set.
5. Suggest they rotate `UPLOAD_PASSWORD` (and create a fresh R2 API token)
   so you no longer have admin access.

---

## Notes & limits

- **R2 free tier**: 10 GB storage included, zero egress fees. Beyond 10 GB:
  ~\$0.015/GB/month.
- **Pages Functions**: 100 000 invocations/day on free tier, ~100 MB request
  body limit (large uploads bypass this via presigned URLs).
- **Auth**: a single shared password — appropriate for one client managing
  their own media. Not suitable for multi-user scenarios.
- **EXIF metadata** in originals is **not** stripped. Client-generated
  thumbnails are re-encoded so they don't contain EXIF GPS data.
- **No delete UI for individual albums on the public site** — admin only.

For client-facing instructions, see [CLIENT-GUIDE.md](CLIENT-GUIDE.md).
