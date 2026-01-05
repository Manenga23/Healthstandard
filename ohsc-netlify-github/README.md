# OHSC Compliance Auto-Pack (GitHub + Netlify)

This is a **deploy-ready starter** for an OHSC documentation generator:
- Static website pages (sales + form)
- Netlify Forms (store submissions)
- Netlify Function that **generates a ZIP instantly** (placeholder TXT docs) based on routing rules

## Quick deploy (Netlify)
1. Push this folder to a GitHub repo.
2. In Netlify: **New site from Git** → select your repo.
3. Build settings:
   - Build command: *(none)*
   - Publish directory: `.`
4. Deploy.

## Test the generator
Open `/start-compliance.html` and use **Option 2** (Instant ZIP generator).

## Upgrade to real PDFs/Word docs
Replace placeholder TXT generation in `netlify/functions/generate-pack.js` with:
- HTML → PDF (e.g., Playwright, Puppeteer, or a dedicated PDF service)
- DOCX templating (e.g., docxtemplater)
- Add storage (Netlify Blob, S3, or Supabase) and email delivery.

## Netlify Functions
- `generate-pack` returns `application/zip` with folders:
  - 01_GOVERNANCE
  - 02_IPC
  - 03_MEDICINES (conditional)
  - 04_HR (conditional)
  - 05_SAFETY
  - INSPECTION_INDEX.txt

## Environment variables (optional)
None required for the demo ZIP generator.
