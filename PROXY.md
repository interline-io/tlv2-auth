# API proxy

With `proxyEnabled: true`, the module mounts a same-origin proxy that forwards
browser requests to a backend API under the signed-in user's token, which the
browser never sees. The module owns the route, the user's credential and the
`tlv2proxy:request` hook; an app that sends a key of its own attaches the key
in that hook. (The proxy is off by default because it sends server-side
credentials, so an app has to opt in.)

## Why proxy at all

A browser calling the backend API directly has two problems the proxy removes by
construction:

- **CORS.** Cross-origin calls need preflights and permissive `Access-Control-*`
  headers on the API. Routing through `/proxy/...` makes every call same-origin,
  so CORS never enters the picture.
- **Credentials in the client.** A token or apikey shipped to the browser is
  exposed. The proxy holds the user's token server-side and attaches it to the
  outbound request, and an app's hook can attach the app's own key, so the
  client sends neither.

```
browser ──▶ /proxy/{name}/path ──▶ [resolve backend, user's token, app hooks] ──▶ https://backend/path
```

## Configuring backends

Declare backends in `runtimeConfig.tlv2proxy.backends`. Each is a base URL,
mounted at `/{proxyPrefix}/{name}` (default prefix `/proxy`). The record is
open — add any name without changing the module.

```ts
// nuxt.config.ts
runtimeConfig: {
  tlv2proxy: {
    backends: {
      default:       { base: 'https://api.transit.land/api/v2' },
      stationEditor: { base: 'https://saas.transit.land/api/v2' },
    },
  },
}
```

Set a base from the environment with `NUXT_TLV2PROXY_BACKENDS_<NAME>_BASE`.
Nitro only overrides keys that already exist in the config object, so a backend
must be **declared** (at least its `base`) in `nuxt.config` for the variable to
bind — you can't create a whole backend from env vars alone. A camelCase name
maps to SNAKE_CASE in the variable: `stationEditor` → `..._STATION_EDITOR_...`.
Prefer single-word names to avoid the ambiguity.

The `default` backend also serves the `/auth/session` `me` enrichment (roles),
which it fetches from `{base}/query` with the user's token alone.

## Credentials

The proxy sends the caller's own credential, and no credential of its own:

- A signed-in user's token goes upstream as `Authorization: Bearer …`. A token
  is exclusive: an apikey the caller sent is dropped.
- Without a token, an apikey the caller supplied, by `?apikey=` or an `apikey`
  header, goes upstream as the `apikey` header. The parameter never stays on the
  forwarded URL.
- Otherwise the request goes upstream with no credential, unless a hook attaches
  the app's key (below).
- A **degraded** session (logged in, but the token expired or refresh failed)
  401s on every backend before any hook runs, so a known user re-authenticates
  rather than going out under an app's shared identity.
- The app-wide `requireLogin` module option 401s every anonymous request, also
  before any hook runs.

The proxy strips the caller's cookies and credential headers, so the session
cookie never reaches an upstream, and only the credentials above go out.

## Security model

The module enforces the credential rules above. Cross-site request forgery
against the session is covered by the session cookie's `SameSite=Lax`: another
origin's fetch/form-POST doesn't carry it, so nobody can ride a logged-in
user's session through the proxy.

An app that attaches a key of its own lends that key's identity to anyone who
can reach the proxy. Whether and how to add friction there is the app's
decision, since only the app knows which requests should carry its key and what
abuse costs it. Attach the key last, after the hook's own checks, so a request
that misses a check goes out without the key.

The pattern we recommend: on document loads, issue a short-lived signed token
(nonce + expiry + HMAC) as an httpOnly `SameSite=Lax` cookie; in a
`tlv2proxy:request` hook (below), attach the app's key only to a request that
carries a valid token, and refuse the rest; mark in-process SSR fetches with a
per-boot secret so the server's own loopback traffic passes, and blank the
marker through `request.headers`, since the proxy forwards request headers
upstream. Scripted abuse then requires re-visiting a page whenever the token
expires, which is where rate limiting and bot detection live.

The proxy answers its own refusals (a 404 for an unknown backend or a path
outside the backend's base, the 401s above) as JSON, whatever the request
accepts. A path outside the base also gets a warning in the log, since it is
usually a probe for SSRF or traversal, or a sign of a misconfigured base. A
proxy URL is never a page, so a navigation to one, such as a download link,
gets the JSON rather than Nuxt's HTML error page.

## App policy: the `tlv2proxy:request` hook

The proxy calls the Nitro runtime hook `tlv2proxy:request` once for each
request it is about to forward: after it has resolved the backend and the
caller's credential, and before anything goes upstream. A request the proxy
refuses itself never reaches the hook. Register it in a server plugin:

```ts
// server/plugins/proxy-policy.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('tlv2proxy:request', async (request) => {
    if (request.credential !== 'none') {
      return
    }
    if (!(await hasValidToken(request.event))) {
      request.refuse({ statusCode: 403, statusMessage: 'Forbidden', message: 'Missing or invalid proxy token' })
      return
    }
    request.apikey = useRuntimeConfig(request.event).proxyApikey
  })
})
```

The hook receives a `ProxyRequest`:

| Field | Type | Meaning |
|-------|------|---------|
| `event` | `H3Event` | The incoming request. Read-only. |
| `backend` | `string` | The backend's name, the path segment after the prefix. Read-only. |
| `path` | `string` | The path and query after the backend segment, such as `/query`, exactly as forwarded: dot segments are resolved, and a caller-supplied `apikey` parameter is removed. A bare `/{proxyPrefix}/{name}` goes to the backend's base itself, less any trailing slash, and its `path` is empty, or `/` when the base is a host root. Read-only. |
| `credential` | `'token' \| 'apikey' \| 'none'` | The caller's own credential, which the proxy sends upstream: the signed-in user's token, an apikey the caller supplied, or none. Read-only. |
| `apikey` | `string?` | Set to send this key upstream, such as the app's own. The proxy sends it alongside a user's token or alone, but never over a key the caller supplied. |
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

Some headers come only from the proxy: the credentials (`authorization`,
`apikey`, `cookie`, `proxy-authorization`) and the framing fetch computes
(`content-length`, `transfer-encoding`, `host`). A hook sends a key through
`apikey`, which the proxy weighs against a key the caller supplied, rather than
through `headers`. A header a hook sets replaces the caller's copy, but where
no hook sets a header, the caller's copy goes upstream. An upstream that trusts
a header from the proxy should therefore check a signature on the header rather
than trust its presence.

A hook that breaks this contract has a bug: setting a header only the proxy
sets, a body on a GET or HEAD, or a refusal whose status is not an HTTP error.
The proxy logs the bug, reports it through Nitro's `captureError`, and answers
a JSON 500 rather than forwarding. An error a hook throws is a failure, and
Nitro reports it as one.

The module exports the `ProxyRequest` and `ProxyRefusal` types to the app's
server code.

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
`curl`, health checks) goes through the proxy with no credential, and the app's
hook decides whether to attach its key, as for any anonymous request.

## Reference

| Thing | Value |
|-------|-------|
| Proxy prefix (default) | `/proxy` (`proxyPrefix` option) |
| Backend env var | `NUXT_TLV2PROXY_BACKENDS_<NAME>_BASE` |
| Composables | `useApiEndpoint`, `useProxySsrFetch` |
| Nitro hook | `tlv2proxy:request`, with a `ProxyRequest` |
