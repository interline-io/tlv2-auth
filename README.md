# @interline-io/tlv2-auth

Nuxt 4 module providing authentication and API proxying for Transitland v2 applications. Replaces client-side Auth0 SPA token flow with server-side sessions via `@auth0/auth0-nuxt` using HTTP-only cookies.

## Features

- Server-side Auth0 sessions (always bundled; gracefully disabled at runtime when credentials are absent)
- Same-origin API proxy with per-backend credential policy (token-exclusive apikey injection, `requireToken` fail-closed) — the module mounts the route itself
- Transparent for app code: plain `fetch`/`$fetch` against proxy paths work on both client and SSR (in-process loopback; only the proxy talks to the upstream)
- Session enrichment with roles from a GraphQL `me` endpoint
- Composables: `useUser`, `useLogin`, `useLogout`, `useApiEndpoint`, `useProxySsrFetch`

See [PROXY.md](PROXY.md) for the full proxy model — credential policy, security model, and client/SSR usage.

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
    // injects credentials server-side. Set secrets via env
    // (NUXT_TLV2PROXY_BACKENDS_DEFAULT_APIKEY). See PROXY.md.
    tlv2proxy: {
      backends: {
        default: { base: 'https://api.transit.land/api/v2', apikey: '' },
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
| `requireLogin` | `boolean` | `false` | Redirect unauthenticated users to Auth0 login (client-side page gate) |
| `loginGate` | `boolean` | `false` | Show login UI gate |
| `authPrefix` | `string` | `'/auth'` | URL prefix for auth routes (login, logout, session) |
| `proxyEnabled` | `boolean` | `false` | Mount the API proxy. Off by default — it injects server-side credentials, so it must be explicitly opted into |
| `proxyPrefix` | `string` | `'/proxy'` | URL prefix the module mounts the proxy under, and that `useApiEndpoint` builds requests against |
| `autoAppBaseUrl` | `boolean` | `false` | Derive auth0 `appBaseUrl` from request `Host` header (see below) |

`requireLogin` is the page-level login gate. It is **not** a proxy setting — per-backend fail-closed behaviour is `requireToken` (see [PROXY.md](PROXY.md)).

### `autoAppBaseUrl`

When enabled, the module derives `appBaseUrl` from the request's `Host` and `x-forwarded-proto` headers instead of using the static `NUXT_AUTH0_APP_BASE_URL` value. This is useful for branch/preview deploys where the URL isn't known at build time (e.g., Cloudflare Pages, Vercel preview deployments).

**Caveat:** This trusts the `Host` and `x-forwarded-proto` headers. Only enable on platforms where these are set by a trusted edge proxy (Cloudflare, Vercel, Netlify, etc.). Do not enable when the application is directly exposed to the internet without a trusted reverse proxy.

## Cloudflare Workers

The module includes a synchronous Nitro plugin that works around a race condition in `@auth0/auth0-nuxt`, where its async server plugin doesn't complete before the first request on Cloudflare Workers. This runs automatically when auth0 is enabled and no-ops on platforms where the async plugin completes normally (e.g., Node.js).

## API proxy

Set `proxyEnabled: true` to mount a same-origin proxy at `{proxyPrefix}` (default `/proxy`); it injects server-side credentials so the browser never handles an apikey and never makes a cross-origin call. Declare backends in `runtimeConfig.tlv2proxy.backends`; each is mounted at `/{proxyPrefix}/{name}`.

```ts
modules: [['@interline-io/tlv2-auth', { proxyEnabled: true }]]
```

```ts
tlv2proxy: {
  backends: {
    // Public: injects a fallback apikey for token-less callers.
    default:       { base: 'https://api.transit.land/api/v2', apikey: '' },
    // Strict: no apikey; 401s unless the request has a valid user token.
    stationEditor: { base: 'https://api.transit.land/api/v2', requireToken: true },
  },
}
```

Supply secrets via `NUXT_TLV2PROXY_BACKENDS_<NAME>_<FIELD>` (e.g. `NUXT_TLV2PROXY_BACKENDS_DEFAULT_APIKEY`). The `default` backend also serves `/auth/session` `me` enrichment and SSR data fetches.

**[PROXY.md](PROXY.md) documents the rest** — the credential rules (token-exclusive apikey, `requireToken`, `apikeyWithToken`), the security model (including the recommended anti-abuse gate pattern for apps that configure an anonymous apikey), and how to call the proxy from client code, MapLibre, and SSR.

### Migration

During migration the legacy `NUXT_TLV2_GRAPHQL_APIKEY` (apikey) and `NUXT_TLV2_PROXY_BASE_<NAME>` (endpoints) env vars map into any backend you have **not** declared in `tlv2proxy.backends` — a declared backend is never merged into, so a deliberately keyless backend stays fail-closed even if a stale legacy apikey lingers. Move to `NUXT_TLV2PROXY_BACKENDS_<NAME>_*`; the legacy bridge is temporary.

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
