# @interline-io/tlv2-auth

Nuxt 4 module providing authentication and API proxying for Transitland v2 applications. Replaces client-side Auth0 SPA token flow with server-side sessions via `@auth0/auth0-nuxt` using HTTP-only cookies.

## Features

- Server-side Auth0 sessions (conditionally installed only when `clientId` is configured)
- Multi-backend API proxy at `/proxy/{backendName}/...` with per-backend URL configuration
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
    tlv2: {
      graphqlApikey: '',
      proxyBase: {
        default: '',        // e.g. https://transit.land/api/v2
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

Without Auth0 env vars, the module works without authentication — useful for local development.

## Module options

Options can be passed via the module array syntax:

```ts
modules: [['@interline-io/tlv2-auth', { autoAppBaseUrl: true }]]
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `proxy` | `boolean` | `false` | Enable the API proxy |
| `proxyBase` | `string \| Record<string, string>` | — | Backend URL(s) for the API proxy |
| `requireLogin` | `boolean` | `false` | Redirect unauthenticated users to Auth0 login; also rejects unauthenticated proxy requests with 401 |
| `loginGate` | `boolean` | `false` | Show login UI gate |
| `authPrefix` | `string` | `'/auth'` | URL prefix for auth routes (login, logout, session) |
| `proxyPrefix` | `string` | `'/proxy'` | URL prefix for the proxy route |
| `autoAppBaseUrl` | `boolean` | `false` | Derive auth0 `appBaseUrl` from request `Host` header (see below) |

### `autoAppBaseUrl`

When enabled, the module derives `appBaseUrl` from the request's `Host` and `x-forwarded-proto` headers instead of using the static `NUXT_AUTH0_APP_BASE_URL` value. This is useful for branch/preview deploys where the URL isn't known at build time (e.g., Cloudflare Pages, Vercel preview deployments).

**Caveat:** This trusts the `Host` and `x-forwarded-proto` headers. Only enable on platforms where these are set by a trusted edge proxy (Cloudflare, Vercel, Netlify, etc.). Do not enable when the application is directly exposed to the internet without a trusted reverse proxy.

## Cloudflare Workers

The module includes a synchronous Nitro plugin that works around a race condition in `@auth0/auth0-nuxt`, where its async server plugin doesn't complete before the first request on Cloudflare Workers. This runs automatically when auth0 is enabled and no-ops on platforms where the async plugin completes normally (e.g., Node.js).

## API proxy

The proxy at `/proxy/{backendName}/...` (configurable via `proxyPrefix`) forwards requests to the backend URL configured in `runtimeConfig.tlv2.proxyBase.{backendName}`.

- Unauthenticated requests get the server's default API key injected
- Authenticated requests additionally get the user's JWT
- Callers may provide their own API key via `?apikey=` query param or `apikey` header, which takes precedence over the default

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

## Release workflow

Changesets drives versioning and publishing:

1. PRs include a `.changeset/*.md` file (created by `pnpm changeset`)
2. On merge to `main`, the `@changesets/action` bot opens or updates a **"Version Packages"** PR that bumps versions and generates CHANGELOGs
3. Merging the Version Packages PR triggers publish to GitHub Packages

Every push to `main` also publishes a SHA pre-release (`0.0.0-sha.<sha>`) for internal testing.

## Dependencies

- `@auth0/auth0-nuxt` — server-side Auth0 sessions
- `defu` — config merging
