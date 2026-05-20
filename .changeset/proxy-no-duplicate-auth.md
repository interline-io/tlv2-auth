---
'@interline-io/tlv2-auth': patch
---

Fix authenticated proxy requests being rejected by the backend with `token is malformed: token contains an invalid number of segments` (HTTP 401).

The `auth.server` plugin injected `Authorization`/`apikey` onto backend requests with `Headers.append()`. Because the server-side proxy already attaches those headers, the request — which flows through the patched `globalThis.fetch` — had them appended a second time, comma-joining into `Authorization: "Bearer <tok>, Bearer <tok>"`. Switched both injection paths (`$fetch` `onRequest` and the `globalThis.fetch` override) to `Headers.set()`, which is idempotent.

Also stop forwarding the browser session cookie to the backend API in the proxy: it's irrelevant to the API and the encrypted auth0-nuxt session cookie duplicates the JWT.
