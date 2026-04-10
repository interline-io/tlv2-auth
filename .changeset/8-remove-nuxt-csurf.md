---
'@interline-io/tlv2-auth': minor
---

Remove `nuxt-csurf` from the module. CSRF protection is now the responsibility of consuming applications.

The API proxy is no longer registered by default. Set `proxy: true` in module options to enable it.

The proxy now respects `requireLogin` — unauthenticated requests return 401 when enabled.
