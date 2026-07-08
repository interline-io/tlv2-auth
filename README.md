# @interline-io/tlv2-auth

Nuxt 4 module providing authentication and API proxying for Transitland v2 applications. Replaces client-side Auth0 SPA token flow with server-side sessions via `@auth0/auth0-nuxt` using HTTP-only cookies.

## Features

- Server-side Auth0 sessions (always bundled; gracefully disabled at runtime when credentials are absent)
- Opt-in multi-backend API proxy: declare backends in `tlv2proxy.backends` (per-backend URL, apikey, and fail-closed policy)
- SSR auth header injection for `$fetch` and `globalThis.fetch`
- Session enrichment with roles from a GraphQL `me` endpoint
- Composables: `useUser()`, `useLogin()`, `useLogout()`, `useApiEndpoint()`

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
    // Server-side only (use NUXT_AUTH0_* / NUXT_TLV2_* env vars)
    auth0: {
      domain: '',
      clientId: '',
      clientSecret: '',
      sessionSecret: '', // openssl rand -hex 32
      appBaseUrl: '',
      audience: '',
    },
    tlv2proxy: {
      backends: {
        default: { base: '', apikey: '' }, // e.g. base https://transit.land/api/v2
      },
    },
    public: {
      tlv2: {
        loginGate: false,   // show login UI
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
| `requireLogin` | `boolean` | `false` | Redirect unauthenticated users to Auth0 login (client-side gate) |
| `loginGate` | `boolean` | `false` | Show login UI gate |
| `authPrefix` | `string` | `'/auth'` | URL prefix for auth routes (login, logout, session) |
| `proxyPrefix` | `string` | `'/proxy'` | URL prefix the client builds proxy requests against, and where you mount your proxy route |
| `autoAppBaseUrl` | `boolean` | `false` | Derive auth0 `appBaseUrl` from request `Host` header (see below) |

### `autoAppBaseUrl`

When enabled, the module derives `appBaseUrl` from the request's `Host` and `x-forwarded-proto` headers instead of using the static `NUXT_AUTH0_APP_BASE_URL` value. This is useful for branch/preview deploys where the URL isn't known at build time (e.g., Cloudflare Pages, Vercel preview deployments).

**Caveat:** This trusts the `Host` and `x-forwarded-proto` headers. Only enable on platforms where these are set by a trusted edge proxy (Cloudflare, Vercel, Netlify, etc.). Do not enable when the application is directly exposed to the internet without a trusted reverse proxy.

## Cloudflare Workers

The module includes a synchronous Nitro plugin that works around a race condition in `@auth0/auth0-nuxt`, where its async server plugin doesn't complete before the first request on Cloudflare Workers. This runs automatically when auth0 is enabled and no-ops on platforms where the async plugin completes normally (e.g., Node.js).

## API proxy

The proxy is **opt-in**: the module ships the dispatch handler but does not mount a route. A consumer opts in with a config block and a one-line route file.

1. **Declare backends** in `runtimeConfig.tlv2proxy.backends` (the module auto-registers each at `/{prefix}/{name}`):

   ```ts
   runtimeConfig: {
     tlv2proxy: {
       backends: {
         // Public: apikey fallback identity for token-less requests.
         default:       { base: 'https://api.example.com', apikey: '' },
         // Strict: no apikey; 401s unless the request has a valid user token.
         stationEditor: { base: 'https://saas.example.com', requireToken: true },
       },
     },
   }
   ```

2. **Mount the dispatcher** (`server/routes/proxy/[...].ts`):

   ```ts
   export { proxyEventHandler as default } from '@interline-io/tlv2-auth/server'
   ```

`backends` is an open record — add any backend name without changing tlv2-auth. Each entry (`{ base, apikey?, requireToken?, apikeyWithToken? }`) carries its own auth policy:

- **`apikey`** is injected only when the request carries no user token — a fallback identity. Omit it to fail closed: a backend with no key never borrows a shared identity.
- **`requireToken`** rejects with 401 unless the request has a valid user token — for privileged backends whose data must never be served to a degraded session. (`requireLogin` is reserved for the page-level login gate; it is not a proxy setting.)
- A valid user token is **exclusive** — the request authenticates as that user and no apikey is attached. Set **`apikeyWithToken: true`** for a backend that needs the apikey for attribution alongside the token.
- Callers may still supply their own key via `?apikey=` / `apikey` header on token-less requests.

Values are driven from env via `NUXT_TLV2PROXY_BACKENDS_<NAME>_<FIELD>` (e.g. `NUXT_TLV2PROXY_BACKENDS_DEFAULT_APIKEY`). The `default` backend also serves the `/auth/session` `me` enrichment and SSR auth injection. For a dynamic backend, call `defineProxyBackend()` from your own nitro plugin. See `playground/` for a complete example.

**CSRF protection:** This module does not include CSRF protection. The proxy injects server-side credentials on behalf of the user, so consuming applications should configure their own CSRF protection (e.g. [`nuxt-csurf`](https://github.com/Morgbn/nuxt-csurf)) on proxy routes. This especially matters for a backend configured with an `apikey`, which will forward requests with that key for any token-less caller. Note that `nuxt-csurf` only intercepts Nuxt's `$fetch` — if your app uses `globalThis.fetch` directly (e.g. Apollo), you will need a client plugin to inject the CSRF token on same-origin requests.

## Composables

- `useUser()` — returns current user state (`loggedIn`, `id`, `name`, `email`, `roles`, `hasRole()`)
- `useLogin(targetUrl)` — redirects to Auth0 login, returns to `targetUrl` after
- `useLogout()` — redirects to Auth0 logout
- `useApiEndpoint(path, backendName)` — returns the correct endpoint URL (direct backend on server, proxy on client)

Composables are auto-imported by Nuxt, but explicit imports are recommended for type safety:

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
