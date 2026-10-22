# @interline-io/tlv2-auth

Nuxt 4 module providing authentication and API proxying for Transitland v2 applications. Replaces client-side Auth0 SPA token flow with server-side sessions via `@auth0/auth0-nuxt` using HTTP-only cookies.

## Features

- Server-side Auth0 sessions (always bundled; gracefully disabled at runtime when credentials are absent)
- Same-origin API proxy that sends the signed-in user's token server-side — the module mounts the route itself
- A `tlv2proxy:request` hook for the app's own proxy policy: attaching the app's own apikey, refusing requests, such as an anti-abuse gate on that key, replacing request bodies, and adding headers to the upstream request
- Transparent for app code: plain `fetch`/`$fetch` against proxy paths work on both client and SSR (in-process loopback; only the proxy talks to the upstream)
- Session enrichment with roles from a GraphQL `me` endpoint
- Composables: `useUser`, `useLogin`, `useLogout`, `useApiEndpoint`, `useProxySsrFetch`

See [PROXY.md](PROXY.md) for the full proxy model — credentials, the hook, security model, and client/SSR usage.

## Install

```bash
pnpm add @interline-io/tlv2-auth
```

Peer dependencies: `nuxt`, `vue`, `h3`

## Usage

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@interline-io/tlv2-auth'],

  runtimeConfig: {
    // Server-side only (use NUXT_AUTH0_* env vars)
    auth0: {
      domain: '',
      clientId: '',
      clientSecret: '',
      sessionSecret: '', // openssl rand -hex 32
      appBaseUrl: '',
      audience: '',
    },
    // Proxy backends — the module mounts each at /{proxyPrefix}/{name} and
    // sends the user's token server-side. See PROXY.md.
    tlv2proxy: {
      backends: {
        default: { base: 'https://api.transit.land/api/v2' },
      },
    },
    public: {
      tlv2: {
        loginGate: false,    // show login UI
        requireLogin: false, // redirect unauthenticated users to login
      },
    },
  },
})
```

Auth0 is always installed at build time. The build-time presence of `NUXT_AUTH0_CLIENT_ID` determines the mode:

- **No-auth** (Playwright, local dev, CI rigs): `NUXT_AUTH0_CLIENT_ID` unset → placeholders baked in, auth disabled at runtime, all users anonymous.
- **Live auth**: `NUXT_AUTH0_CLIENT_ID` set → real `NUXT_AUTH0_*` values read from env at runtime.

If credentials are supplied **only at runtime**, `NUXT_AUTH0_CLIENT_ID` must still be set at build time (any non-empty value works). Otherwise, placeholders will be baked in and runtime env vars will be silently ignored.

## Module options

Options can be passed via the module array syntax:

```ts
modules: [['@interline-io/tlv2-auth', { autoAppBaseUrl: true }]]
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `requireLogin` | `boolean` | `false` | App-wide login gate: redirects unauthenticated users to Auth0 login (client-side) and fail-closes the proxy (anonymous requests 401 on every backend) |
| `loginGate` | `boolean` | `false` | Show login UI gate |
| `authPrefix` | `string` | `'/auth'` | URL prefix for auth routes (login, logout, session) |
| `proxyEnabled` | `boolean` | `false` | Mount the API proxy. Off by default — it sends server-side credentials, so an app has to opt in |
| `proxyPrefix` | `string` | `'/proxy'` | URL prefix the module mounts the proxy under, and that `useApiEndpoint` builds requests against |
| `autoAppBaseUrl` | `boolean` | `false` | Derive auth0 `appBaseUrl` from request `Host` header (see below) |

`requireLogin` is the app-wide login gate: it redirects unauthenticated users client-side **and** fail-closes the proxy server-side (anonymous requests 401 on every backend).

### `autoAppBaseUrl`

When enabled, the module derives `appBaseUrl` from the request's `Host` and `x-forwarded-proto` headers instead of using the static `NUXT_AUTH0_APP_BASE_URL` value. This is useful for branch/preview deploys where the URL isn't known at build time (e.g., Cloudflare Pages, Vercel preview deployments).

**Caveat:** This trusts the `Host` and `x-forwarded-proto` headers. Only enable on platforms where these are set by a trusted edge proxy (Cloudflare, Vercel, Netlify, etc.). Do not enable when the application is directly exposed to the internet without a trusted reverse proxy.

## Cloudflare Workers

The module includes a synchronous Nitro plugin that works around a race condition in `@auth0/auth0-nuxt`, where its async server plugin doesn't complete before the first request on Cloudflare Workers. This runs automatically when auth0 is enabled and no-ops on platforms where the async plugin completes normally (e.g., Node.js).

## API proxy

Set `proxyEnabled: true` to mount a same-origin proxy at `{proxyPrefix}` (default `/proxy`); it attaches the signed-in user's token server-side, so the browser never handles a credential and never makes a cross-origin call. Declare backends in `runtimeConfig.tlv2proxy.backends`; each is a base URL, mounted at `/{proxyPrefix}/{name}`.

```ts
modules: [['@interline-io/tlv2-auth', { proxyEnabled: true }]]
```

```ts
tlv2proxy: {
  backends: {
    default:       { base: 'https://api.transit.land/api/v2' },
    stationEditor: { base: 'https://saas.transit.land/api/v2' },
  },
}
```

Set a base via `NUXT_TLV2PROXY_BACKENDS_<NAME>_BASE`. The `default` backend also serves the `/auth/session` `me` enrichment.

The proxy sends no key of its own. An app that sends one, so anonymous visitors can reach the API, attaches the key in a `tlv2proxy:request` hook, which is also where the app gates the key's use.

**[PROXY.md](PROXY.md) documents the rest** — the credential rules, the hook, the security model (including the recommended anti-abuse gate for an app's key), and how to call the proxy from client code, MapLibre, and SSR.

## Composables

Auto-imported by Nuxt; explicit imports are recommended for type safety.

- `useUser()` — current user state (`loggedIn`, `id`, `name`, `email`, `roles`, `hasRole()`)
- `useLogin(targetUrl)` — redirect to Auth0 login, return to `targetUrl` after
- `useLogout()` — redirect to Auth0 logout
- `useApiEndpoint(path, backend)` — build a same-origin proxy URL (`/{proxyPrefix}/{backend}{path}`); plain `fetch`/`$fetch` against it just work
- `useProxySsrFetch()` — server-only `fetch` (genuine `Response` contract) that loops back through the proxy in-process, authenticated as the requesting user; for SSR data clients like Apollo

```ts
import { useUser, useApiEndpoint } from '@interline-io/tlv2-auth/composables'
import type { TlUser } from '@interline-io/tlv2-auth/composables'
```

## Development

```bash
pnpm install          # Install (requires NODE_AUTH_TOKEN for GitHub Packages)
pnpm dev              # Start playground dev server (http://localhost:3000)
pnpm build            # Build the module
pnpm test             # Run unit tests
pnpm lint             # ESLint
pnpm nuxt typecheck   # Type-check
```

Copy `playground/.env.example` to `playground/.env` and fill in your Auth0 and API credentials to test the full login flow.

## Publishing

There is no semver and no changesets. Every push publishes a `0.0.0`-based build to GitHub Packages; consumers pin the exact (immutable) string.

- `main` → `@interline-io/tlv2-auth@0.0.0-main.<sha>` (dist-tag `latest`)
- any branch → `@interline-io/tlv2-auth@0.0.0-branch.<branch>.<sha>` (dist-tag `<branch>`)

The `0.0.0` base keeps builds sorting below any older real release; the `main`/`branch` prefix makes main builds vs branch previews obvious.

Because the version *is* a commit SHA, the changelog between two builds is the PR range `https://github.com/interline-io/tlv2-auth/compare/<oldsha>...<newsha>` — there is no changelog file. Write detailed, self-contained PR descriptions so they serve as that record; review the PRs in the range (and any breaking changes) before bumping a consuming app's pin.

## Dependencies

- `@auth0/auth0-nuxt` — server-side Auth0 sessions
- `defu` — config merging
