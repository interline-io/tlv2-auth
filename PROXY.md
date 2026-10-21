# API proxy

With `proxyEnabled: true`, the module mounts a same-origin proxy that forwards
browser requests to a backend API, injecting server-side credentials the
browser never sees. It owns the route and the credential policy — consumers opt
in, configure backends, and make same-origin requests; nothing else. (It's off
by default because it injects credentials — it should never appear just because
legacy env vars are set.)

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

### Migrating from the legacy config

The old `NUXT_TLV2_GRAPHQL_APIKEY` (apikey) and `NUXT_TLV2_PROXY_BASE_<NAME>`
(endpoint) env vars still work during migration: each maps into a backend you
have **not** declared in `tlv2proxy.backends`, with the legacy apikey attached
to every bridged backend (reproducing the old single-key behaviour). A
**declared** backend is never merged into, so moving one to `tlv2proxy.backends`
without an `apikey` makes it fail-closed even if a stale legacy apikey lingers.
Move to `NUXT_TLV2PROXY_BACKENDS_<NAME>_*`; the bridge is temporary.

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
- The `apikey` is the anonymous fallback: attached only when there's no token
  **and** the caller was never logged in.
- A **degraded** session (logged in, but token expired / refresh failed) never
  borrows the apikey: it 401s on **any** backend, so a known user re-authenticates
  rather than silently downgrading to the shared anonymous identity. Only a
  genuinely anonymous caller gets the apikey fallback where a backend allows it.
- The app-wide `requireLogin` module option fail-closes the **whole** proxy: with
  it set, every anonymous request 401s (no apikey fallback on any backend). Use a
  backend's `requireToken` to fail-close just that one backend instead.
- Callers may still pass their own key via `?apikey=` or an `apikey` header on
  anonymous token-less requests.

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
in a `tlv2proxy:request` hook (below), refuse a request whose `sharedApikey` is
set unless it carries the token (cookie alone for safe methods — navigations
can't set headers — cookie + matching header for unsafe methods); mark
in-process SSR fetches with a per-boot secret so the server's own loopback
traffic passes. Scripted abuse then requires re-visiting a page whenever the
token expires, which is where rate limiting and bot detection live.

The proxy answers its own refusals (a 404 for an unknown backend or a path
outside the backend's base, the 401s above) as JSON, whatever the request
accepts. A path outside the base also gets a warning in the log, since it is
usually a probe for SSRF or traversal, or a sign of a misconfigured base. A proxy URL is never a page, so a
navigation to one, such as a download link, gets the JSON rather than Nuxt's
HTML error page.

## App policy: the `tlv2proxy:request` hook

The proxy calls the Nitro runtime hook `tlv2proxy:request` once for each
request it is about to forward: after it has resolved the backend and applied
its credential policy, and before anything goes upstream. A request the proxy
refuses itself never reaches the hook. Register it in a server plugin:

```ts
// server/plugins/proxy-policy.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('tlv2proxy:request', async (request) => {
    if (request.sharedApikey && !(await hasValidToken(request.event))) {
      request.refuse({ statusCode: 403, statusMessage: 'Forbidden', message: 'Missing or invalid proxy token' })
    }
  })
})
```

The hook receives a `ProxyRequest`:

| Field | Type | Meaning |
|-------|------|---------|
| `event` | `H3Event` | The incoming request. Read-only. |
| `backend` | `string` | The backend's name, the path segment after the prefix. Read-only. |
| `path` | `string` | The path and query after the backend segment, such as `/query`, exactly as forwarded: dot segments are resolved, and a caller-supplied `apikey` parameter is removed. Read-only. |
| `sharedApikey` | `boolean` | True when the request goes upstream under the backend's own `apikey`: an anonymous caller on a backend with a fallback key, or a token with `apikeyWithToken`. False for a token alone, or a key the caller supplied. Read-only. |
| `body` | `string?` | Set to send this upstream in place of the request's own body. The proxy sends the new body's length. Not allowed on a GET or HEAD. |
| `headers` | `Record<string, string>` | Headers to set on the request sent upstream, replacing any the caller sent under the same names. Starts empty. |
| `refusal` | `ProxyRefusal?` | The first refusal a hook made, if any. Read-only. |
| `refuse(refusal)` | method | Refuses the request with `{ statusCode, statusMessage?, message }`, where `statusCode` is 400 through 599. The proxy answers the refusal as JSON and forwards nothing. Only the first refusal counts. |

A refusal is a value, not an error: the hook calls `refuse` and returns. Every
registered hook still runs, in the order they were registered, so a hook that
finds `refusal` already set should leave the request alone; nothing can undo a
refusal. One plugin that registers a single hook keeps its checks in code
order. A hook that answers the response itself, with `sendRedirect` for
instance, ends the request, and the proxy forwards nothing. A hook that needs
the request body reads the body with h3's `readRawBody(request.event)`.

Some headers come only from the proxy: the credentials its policy chooses
(`authorization`, `apikey`, `cookie`, `proxy-authorization`) and the framing
fetch computes (`content-length`, `transfer-encoding`, `host`). A header a hook
sets replaces the caller's copy, but where no hook sets a header, the caller's
copy goes upstream. An upstream that trusts a header from the proxy should
therefore check a signature on the header rather than trust its presence.

A hook that breaks this contract has a bug: setting a header only the proxy
sets, a body on a GET or HEAD, or a refusal whose status is not an HTTP error.
The proxy logs the bug, reports it through Nitro's `captureError`, and answers
a JSON 500 rather than forwarding. An error a hook throws is a failure, and
Nitro reports it as one.

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
| Nitro hook | `tlv2proxy:request`, with a `ProxyRequest` |
