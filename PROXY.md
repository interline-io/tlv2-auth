# API proxy

The module mounts a same-origin proxy that forwards browser requests to a
backend API, injecting server-side credentials the browser never sees. It owns
the route, the credential policy, and the CSRF/anti-abuse gate in one place —
consumers configure backends and make same-origin requests; nothing else.

## Why proxy at all

A browser calling the backend API directly has two problems the proxy removes by
construction:

- **CORS.** Cross-origin calls need preflights and permissive `Access-Control-*`
  headers on the API. Routing through `/proxy/...` makes every call same-origin,
  so CORS never enters the picture.
- **Credentials in the client.** An apikey shipped to the browser is public. The
  proxy holds the key server-side and attaches it (or the user's token) to the
  outbound request, so the client sends neither.

```
browser ──▶ /proxy/{name}/path ──▶ [resolve backend, gate, inject creds] ──▶ https://backend/path
```

## Configuring backends

Declare backends in `runtimeConfig.tlv2proxy.backends`. Each is mounted at
`/{proxyPrefix}/{name}` (default prefix `/proxy`). The record is open — add any
name without changing the module.

```ts
// nuxt.config.ts
runtimeConfig: {
  tlv2proxy: {
    backends: {
      // Public: injects a fallback apikey for token-less callers.
      default:       { base: 'https://api.transit.land/api/v2', apikey: '' },
      // Strict: no apikey; 401s unless the request carries a valid user token.
      stationEditor: { base: 'https://api.transit.land/api/v2', requireToken: true },
    },
  },
}
```

Supply secrets from the environment rather than committing them:

```
NUXT_TLV2PROXY_BACKENDS_DEFAULT_APIKEY=your-key
```

The env var is `NUXT_TLV2PROXY_BACKENDS_<NAME>_<FIELD>`. Nitro only overrides
keys that already exist in the config object, so a backend must be **declared**
(at least its `base`) in `nuxt.config` for env overrides to bind — you can't
create a whole backend from env vars alone. A camelCase name maps to
SNAKE_CASE in the variable: `stationEditor` → `..._STATION_EDITOR_...`. Prefer
single-word names to avoid the ambiguity.

### Per-backend policy

| Field | Type | Meaning |
|-------|------|---------|
| `base` | `string` | Upstream base URL. Required. |
| `apikey` | `string?` | Fallback identity, injected **only** for token-less requests. Omit to fail closed — the backend never borrows a shared identity. |
| `requireToken` | `boolean?` | 401 unless the request carries a valid user token. For privileged data that must never be served to an anonymous or degraded session. |
| `apikeyWithToken` | `boolean?` | Also attach the apikey alongside a user token (for backends that key attribution off it). |

**Credential rules:**

- A valid user token is **exclusive** — the request authenticates as that user
  and no apikey is attached (unless `apikeyWithToken`).
- The `apikey` is the anonymous fallback: attached only when there's no token.
- A **degraded** session (token expired, no refresh) is treated as no token: a
  `requireToken` backend 401s cleanly rather than silently downgrading to the
  apikey identity.
- Callers may still pass their own key via `?apikey=` or an `apikey` header on
  token-less requests.

The `default` backend is special: it also serves the `/auth/session` `me`
enrichment (roles) and is the target for SSR data fetches.

## Security: CSRF + anti-abuse

A same-origin proxy is a confused deputy — it holds the apikey and will attach it
for any caller. Two things have to be true: another site must not be able to ride
a logged-in user's session (**CSRF**), and a random script must not be able to
spray the endpoint to borrow the apikey (**anti-abuse**). Both are handled by a
signed double-submit token, checked per request.

**The token.** A random nonce plus an HMAC signature (keyed on the auth0 session
secret, domain-separated). The signature is what makes it *unforgeable*: a valid
token proves the server issued it — i.e. the caller loaded a page — which is the
anti-abuse floor. It is delivered to the browser as the `tlv2_csrf` cookie
(`HttpOnly`, `Secure` in production, `SameSite=Lax`), issued on document loads.

**The gate** ([`server/api/proxy.ts`](src/runtime/server/api/proxy.ts)) is
method-aware:

| Method | Requirement |
|--------|-------------|
| Safe (`GET`/`HEAD`/`OPTIONS`) | A validly-signed `tlv2_csrf` cookie. |
| Unsafe (`POST`/`PUT`/`PATCH`/`DELETE`) | The cookie **and** a matching `x-csrf-token` header (double-submit). |

Why the split:

- The **cookie is required on every method** — that's the anti-abuse floor. A
  tokenless `curl` (any method) has no signed cookie → 403. To get one you must
  load a page.
- The **header is required only on unsafe methods** — that's the CSRF ceiling.
  The header is the half a cross-origin attacker can't produce (same-origin
  policy stops them reading the token; `SameSite=Lax` keeps the cookie off their
  cross-site requests). Mutations always go through `fetch`, which can set it.
- **Safe methods skip the header** because they have to: a feed-version download
  (`<a href download>`), a map tile, a plain link — these are browser
  *navigations/subresources* that physically cannot carry a custom header. They
  ride the cookie, which the browser attaches automatically same-origin. This is
  the same line Django/Rails/most CSRF middleware draw (`GET`/`HEAD`/`OPTIONS`
  exempt), and it doesn't weaken `POST` protection.

The token is *not* a session secret — exposing it to same-origin JS is expected
(that's how the header gets set). What must never leak is the auth0 session
cookie, which stays `HttpOnly` and is never forwarded upstream.

## Client usage

Build same-origin URLs with `useApiEndpoint(path, backend)`:

```ts
const url = useApiEndpoint('/query', 'default')   // "/proxy/default/query"
```

**GET (downloads, links, tiles)** — nothing to add; the cookie rides along:

```ts
// A feed-version download link just works — the cookie is attached automatically.
<a :href="useApiEndpoint('/rest/feed_versions/' + key + '/download', 'default')" download>
```

**POST (queries, mutations)** — echo the CSRF header via `useCsrf()`:

```ts
const { token, headerName } = useCsrf()
await fetch(useApiEndpoint('/query', 'default'), {
  method: 'POST',
  headers: { 'content-type': 'application/json', [headerName]: token.value },
  body: JSON.stringify({ query }),
})
```

**MapLibre** — tiles fetch in a web worker, so headers can only be added in
`transformRequest` (main thread). Same-origin proxy tiles are GET, so the cookie
is enough:

```ts
transformRequest: (url, resourceType) => {
  if (resourceType === 'Tile' && url.startsWith(sameOriginProxyBase)) {
    return { url, credentials: 'include' }   // GET → cookie only, no header
  }
}
```

`credentials: 'include'` is only meaningful for *same-origin* proxy tiles; for a
fully external tile server with its own key in the URL, set nothing.

## SSR usage

During server render there's no browser to carry cookies, so a data client
(e.g. Apollo) must loop back through the proxy in-process. `useProxySsrFetch()`
returns a `fetch` that does this — it forwards the request cookie so the proxy
resolves the session, and carries the CSRF token so it clears the same gate:

```ts
const proxyFetch = useProxySsrFetch()   // server-only
const res = await proxyFetch('/proxy/default/query', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query }),
})
```

**Anonymous SSR works.** The loopback is trusted server traffic — the middleware
always mints a valid token into the request context for it, so a fully
anonymous render (Googlebot, link unfurlers, `curl`, health checks) succeeds even
when the client never sent a cookie. External callers are unaffected: the gate
reads the request's own cookie/header, never the context, so a direct anonymous
`POST /proxy/...` still 403s.

### Rendering modes

The client token is currently delivered through the **SSR payload** (`useCsrf()`
reads it from server-render state). This covers SSR apps. A pure SPA
(`ssr: false`) has no payload, so `useCsrf()` would return an empty token and
unsafe-method requests would 403 — see the README's open items.

## Reference

| Thing | Value |
|-------|-------|
| Proxy prefix (default) | `/proxy` (`proxyPrefix` option) |
| CSRF cookie | `tlv2_csrf` (`HttpOnly`, `Secure` in prod, `SameSite=Lax`) |
| CSRF header | `x-csrf-token` |
| Backend env var | `NUXT_TLV2PROXY_BACKENDS_<NAME>_<FIELD>` |
| Composables | `useApiEndpoint`, `useCsrf`, `useProxySsrFetch` |
