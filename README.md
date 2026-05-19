# Fotorex — Password-Protected Photo/Video Gallery

A minimal static gallery website hosted on **Cloudflare Pages** with media files stored in **Cloudflare R2** (S3-compatible object storage with zero egress fees). A drag-and-drop upload page lets clients self-serve without developer help.

## Stack

- **Hosting**: Cloudflare Pages (free tier)
- **Media Storage**: Cloudflare R2 (10 GB free, then $0.015/GB/month)
- **Frontend**: Vanilla HTML/CSS/JavaScript (no build step)
- **API**: Cloudflare Pages Functions (serverless)

## One-Time Setup (Developer)

### 1. Cloudflare Prerequisites
- Create a [Cloudflare account](https://dash.cloudflare.com)
- Create an R2 bucket named `fotorex-media`
  - Configure CORS to allow requests from your Pages domain (or `*` for testing)
- Generate an [API token](https://dash.cloudflare.com/profile/api-tokens) with R2 permissions

### 2. Local Configuration
```bash
npm install -g wrangler
cp wrangler.toml.example wrangler.toml
```

Update `wrangler.toml` with:
- Your Cloudflare account ID
- R2 bucket name
- API token (or authenticate via `wrangler login`)

### 3. Set Secrets
```bash
wrangler secret put UPLOAD_PASSWORD
# Enter a strong password when prompted
```

### 4. Deploy
```bash
wrangler deploy
# Or via Cloudflare Pages: connect your GitHub repo, set build output to "public/"
```

## Client Usage

See **CLIENT-GUIDE.md** for step-by-step instructions with screenshots.

In short:
1. Open `/upload.html`
2. Enter the upload password
3. Select or create an album
4. Drag-and-drop photos/videos
5. They appear in the gallery within seconds

## Architecture

```
fotorex/
├── public/                  # Static assets (served by Pages)
│   ├── index.html           # Album listing page
│   ├── album.html           # Media grid page
│   ├── upload.html          # Password-protected upload interface
│   ├── css/style.css        # All styles (CSS custom properties for theming)
│   ├── js/
│   │   ├── gallery.js       # Album & media grid rendering
│   │   ├── lightbox.js      # Fullscreen photo/video viewer
│   │   └── upload.js        # Drag-and-drop upload logic
│   └── assets/placeholder.svg
├── functions/api/           # Serverless API endpoints
│   ├── albums.js            # GET /api/albums
│   ├── media.js             # GET /api/media?album=X
│   ├── upload.js            # POST /api/upload
│   └── file.js              # GET /api/file?key=X
├── wrangler.toml            # Cloudflare project config
└── README.md
```

## Deployment Checklist

- [ ] Cloudflare R2 bucket created and CORS configured
- [ ] `UPLOAD_PASSWORD` secret set
- [ ] All API endpoints implemented and tested
- [ ] Gallery pages (index.html, album.html) deployed
- [ ] Upload page (upload.html) deployed
- [ ] Custom domain configured (optional)

## Notes

- **R2 Free Tier**: 10 GB included storage, zero egress fees. Beyond 10 GB: $0.015/GB/month.
- **No Builds Needed**: Edit CSS/JS directly; changes live after next deploy.
- **Password is Simple Auth**: Not production-grade; suitable for a personal gallery.
- **No Delete UI**: File deletion requires Cloudflare dashboard access. Can be added later if needed.

---

For client upload instructions, see **CLIENT-GUIDE.md**.
