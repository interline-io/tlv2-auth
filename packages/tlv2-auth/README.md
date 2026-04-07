# @interline-io/tlv2-auth

Nuxt 4 module providing authentication, CSRF protection, and API proxying for Transitland v2 applications. Replaces client-side Auth0 SPA token flow with server-side sessions via `@auth0/auth0-nuxt` using HTTP-only cookies.

## Features

- Server-side Auth0 sessions (conditionally installed only when `clientId` is configured)
- CSRF protection via `nuxt-csurf`, automatically injected into same-origin requests
- Multi-backend API proxy at `/api/proxy/{backendName}/...` with per-backend URL configuration
- SSR auth header injection for `$fetch` and `globalThis.fetch`
- Session enrichment with roles from a GraphQL `me` endpoint
- Composables: `useUser()`, `useLogin()`, `useLogout()`, `useApiEndpoint()`

## Install

```bash
pnpm add @interline-io/tlv2-auth
```

Peer dependencies: `nuxt`, `vue`

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

## API proxy

The proxy at `/api/proxy/{backendName}/...` forwards requests to the backend URL configured in `runtimeConfig.tlv2.proxyBase.{backendName}`.

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
pnpm dev       # Start playground (http://localhost:3000)
pnpm test      # Run unit tests
pnpm lint      # Lint
```

Create a `playground/.env` to test the full login flow:

```bash
NUXT_AUTH0_DOMAIN=your-tenant.auth0.com
NUXT_AUTH0_CLIENT_ID=...
NUXT_AUTH0_CLIENT_SECRET=...
NUXT_AUTH0_SESSION_SECRET=...          # openssl rand -hex 32
NUXT_AUTH0_APP_BASE_URL=http://localhost:3000
NUXT_AUTH0_AUDIENCE=...
NUXT_TLV2_PROXY_BASE_DEFAULT=...      # e.g. https://transit.land/api/v2
NUXT_TLV2_GRAPHQL_APIKEY=...
```

## Dependencies

- `@auth0/auth0-nuxt` — server-side Auth0 sessions
- `nuxt-csurf` — CSRF protection
- `defu` — config merging
