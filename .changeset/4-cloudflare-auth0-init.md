---
'@interline-io/tlv2-auth': minor
---

Add synchronous Nitro plugin for Cloudflare Workers compatibility with @auth0/auth0-nuxt. Add opt-in `autoAppBaseUrl` module option that derives auth0 `appBaseUrl` from the request `Host` header for branch/preview deploys. Note: `autoAppBaseUrl` trusts the `x-forwarded-proto` and `Host` headers — only enable on platforms where these are set by a trusted edge proxy.
