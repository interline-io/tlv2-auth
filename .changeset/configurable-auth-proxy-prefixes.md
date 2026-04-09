---
'@interline-io/tlv2-auth': minor
---

Add `authPrefix` and `proxyPrefix` module options to configure the URL prefixes for auth routes and the API proxy. Defaults remain `/auth` and `/proxy`. CSRF protection on the proxy is now enforced on all HTTP methods (including GET) via Nitro route rules.
