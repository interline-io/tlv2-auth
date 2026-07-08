# API proxy

The module mounts a same-origin proxy that forwards browser requests to a
backend API, injecting server-side credentials the browser never sees. It owns
the route and the credential policy — consumers configure backends and make
same-origin requests; nothing else.

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

## Security model

The module enforces the **credential policy**: token-exclusive injection,
`requireToken` fail-closed, degraded-session 401s, and session-cookie stripping
(the auth0 cookie never reaches an upstream). Cross-site request forgery
against the session is covered by the session cookie's `SameSite=Lax`: another
origin's fetch/form-POST doesn't carry it, so nobody can ride a logged-in
user's session through the proxy.

What the module deliberately does **not** provide is an anti-abuse gate. For a
backend with `requireToken`, none is needed — the JWT is already checked on
every request. The remaining concern applies only to a backend configured with
an anonymous fallback `apikey`: any script can hit the proxy and borrow that
key's identity. Whether and how to add friction there is the consuming app's
decision, because only the app knows which backends carry a key and what its
abuse cost is.

The pattern we recommend for that case: on document loads, issue a short-lived
signed token (nonce + expiry + HMAC) as a JS-readable `SameSite=Lax` cookie;
gate apikey-carrying proxy backends on it in a server middleware (cookie alone
for safe methods — navigations can't set headers — cookie + matching header
for unsafe methods); mark in-process SSR fetches with a per-boot secret so the
server's own loopback traffic passes. Scripted abuse then requires re-visiting
a page whenever the token expires, which is where rate limiting and bot
detection live.

## Client usage

App code needs **no proxy awareness**: use plain `fetch`/`$fetch` against
same-origin URLs from `useApiEndpoint(path, backend)`.

```ts
const url = useApiEndpoint('/query', 'default')   // "/proxy/default/query"
await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query }),
})
```

**GET (downloads, links, tiles)** — plain links and navigations work as-is:

```ts
<a :href="useApiEndpoint('/rest/feed_versions/' + key + '/download', 'default')" download>
```

**MapLibre** — same-origin proxy tiles fetch in a web worker; make sure the
worker request sends cookies (needed if the app adds a cookie-based gate):

```ts
transformRequest: (url, resourceType) => {
  if (resourceType === 'Tile' && url.startsWith(sameOriginProxyBase)) {
    return { url, credentials: 'include' }
  }
}
```

`credentials: 'include'` is only meaningful for *same-origin* proxy tiles; for a
fully external tile server with its own key in the URL, set nothing.

## SSR usage

SSR data requests go through the same proxy, over the in-process loopback —
only the proxy ever talks to the upstream API. App code again needs no proxy
awareness: `$fetch`/`useFetch` against a `useApiEndpoint(...)` path dispatch
in-process. Session auth comes from the forwarded cookie:
`useFetch`/`useRequestFetch` forward it automatically; bare `$fetch` does not
(those requests are anonymous).

For data clients that need the genuine fetch/`Response` contract (e.g. Apollo
links), use `useProxySsrFetch()` — it loops back in-process and forwards the
request cookie so the render is authenticated as the requesting user:

```ts
const proxyFetch = useProxySsrFetch()   // server-only
const res = await proxyFetch('/proxy/default/query', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query }),
})
```

Native `fetch` cannot take a relative URL on the server, so bare
`fetch(useApiEndpoint(...))` in shared code must go through `useProxySsrFetch`
(or `$fetch`) on the SSR side.

**Anonymous SSR works.** A fully anonymous render (Googlebot, link unfurlers,
`curl`, health checks) succeeds — the loopback carries no credentials and the
proxy applies each backend's own policy (apikey fallback or `requireToken`
401).

## Reference

| Thing | Value |
|-------|-------|
| Proxy prefix (default) | `/proxy` (`proxyPrefix` option) |
| Backend env var | `NUXT_TLV2PROXY_BACKENDS_<NAME>_<FIELD>` |
| Composables | `useApiEndpoint`, `useProxySsrFetch` |
