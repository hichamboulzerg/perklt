# perklt — OGAds CPA landing project

Static landing page(s) deployed to Cloudflare Pages (project `giftcardlab`, custom domain `perklt.com`) driving traffic to an OGAds smartlink.

## Structure

- `public/` — static site root, deployed to Cloudflare Pages
- `wrangler.toml` — Cloudflare Pages config

## Deploy

```
wrangler pages deploy ./public
```

Requires `CLOUDFLARE_API_TOKEN` in env.
