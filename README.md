# OHSC Master Pack Generator (Generic) — GitHub + Netlify

This repo deploys a static site + Netlify Function that generates a **PDF-based OHSC Master Pack (Packs 1–5)** as a ZIP.
No practice details are hard-coded; everything is filled from the form input at generation time.

## Deploy
1. Upload to GitHub
2. Netlify: New site from Git
3. Publish directory: .
4. Functions directory: netlify/functions

## Use
Open `/start.html`, fill in details, click **Generate master ZIP**.

## Notes
- This generator produces **simple PDFs** (PDFKit) suitable as inspection-ready templates.
- You can extend wording, add branding/logo, or convert registers to Excel if needed.
