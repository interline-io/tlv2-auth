---
'@interline-io/tlv2-auth': minor
---

Always install auth0-nuxt at build time with placeholder defaults so Auth0 credentials are purely a runtime concern. When `NUXT_AUTH0_*` env vars are absent, auth gracefully no-ops and users are treated as anonymous.

**Breaking:** Module option `proxy` renamed to `proxyEnabled`.

Fix redirect loop when `returnTo` targets an auth route.

Ephemeral session secret generation is now dev-only; production requires `NUXT_AUTH0_SESSION_SECRET` to be set explicitly.
