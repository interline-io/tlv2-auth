---
'@interline-io/tlv2-auth': patch
---

Docs: clarify that `NUXT_AUTH0_CLIENT_ID` must be set at build time even when real credentials are supplied only at runtime (e.g. Cloudflare Pages dashboard). Otherwise, placeholders get baked in and runtime env vars are silently ignored.
