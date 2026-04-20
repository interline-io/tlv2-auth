# @interline-io/tlv2-auth

## 0.2.0

### Minor Changes

- [#4](https://github.com/interline-io/tlv2-auth/pull/4) [`691139d`](https://github.com/interline-io/tlv2-auth/commit/691139d71eb8332ad7467a0db877fa4759f25cb9) Thanks [@irees](https://github.com/irees)! - Add synchronous Nitro plugin for Cloudflare Workers compatibility with @auth0/auth0-nuxt. Add opt-in `autoAppBaseUrl` module option that derives auth0 `appBaseUrl` from the request `Host` header for branch/preview deploys. Note: `autoAppBaseUrl` trusts the `x-forwarded-proto` and `Host` headers — only enable on platforms where these are set by a trusted edge proxy.

- [#8](https://github.com/interline-io/tlv2-auth/pull/8) [`03e262f`](https://github.com/interline-io/tlv2-auth/commit/03e262f1c7d892c456499d3bfeadca2ad0b1d161) Thanks [@irees](https://github.com/irees)! - Remove `nuxt-csurf` from the module. CSRF protection is now the responsibility of consuming applications.

  The API proxy is no longer registered by default. Set `proxy: true` in module options to enable it.

  The proxy now respects `requireLogin` — unauthenticated requests return 401 when enabled.

  Fix SSRF vulnerability in proxy target resolution where scheme-relative URLs (e.g. `//attacker.com`) could redirect requests to arbitrary hosts.

- [#9](https://github.com/interline-io/tlv2-auth/pull/9) [`8f5f298`](https://github.com/interline-io/tlv2-auth/commit/8f5f298371cd14f251b35871f28413584119e0c2) Thanks [@irees](https://github.com/irees)! - Always install auth0-nuxt at build time with placeholder defaults so Auth0 credentials are purely a runtime concern. When `NUXT_AUTH0_*` env vars are absent, auth gracefully no-ops and users are treated as anonymous.

  **Breaking:** Module option `proxy` renamed to `proxyEnabled`.

  Fix redirect loop when `returnTo` targets an auth route.

  Ephemeral session secret generation is now dev-only; production requires `NUXT_AUTH0_SESSION_SECRET` to be set explicitly.

- [#7](https://github.com/interline-io/tlv2-auth/pull/7) [`603855b`](https://github.com/interline-io/tlv2-auth/commit/603855bdba61f13d613c8b92ca0c3809e75e44de) Thanks [@irees](https://github.com/irees)! - Add `authPrefix` and `proxyPrefix` module options to configure the URL prefixes for auth routes and the API proxy. Defaults remain `/auth` and `/proxy`. CSRF protection on the proxy is now enforced on all HTTP methods (including GET) via Nitro route rules.

### Patch Changes

- [#12](https://github.com/interline-io/tlv2-auth/pull/12) [`45205ff`](https://github.com/interline-io/tlv2-auth/commit/45205ffb6035da6968024c05de8766e0cb997b60) Thanks [@irees](https://github.com/irees)! - Add opt-in trace logging gated behind `TL_LOG=trace`. Uses a guard pattern (`if (traceEnabled)`) to avoid argument evaluation when tracing is off. Covers the auth0 middleware, session endpoint, proxy handler, and SSR auth header injection.

  Enable the proxy in the playground and add a proxy test UI for exercising the full auth flow locally.

- [#13](https://github.com/interline-io/tlv2-auth/pull/13) [`a45d5f7`](https://github.com/interline-io/tlv2-auth/commit/a45d5f79b86de5b0daeca4015e0f2d2f517c3c62) Thanks [@irees](https://github.com/irees)! - Register `audience` in the auth0 runtimeConfig schema so consuming apps can set `NUXT_AUTH0_AUDIENCE` without a type error during `nuxt build`.

  Replace `addImportsDir` with explicit `addImports` to eliminate "Duplicated imports" warnings.

- [#15](https://github.com/interline-io/tlv2-auth/pull/15) [`392dbb0`](https://github.com/interline-io/tlv2-auth/commit/392dbb0ef06ffeddb044cf1c2b9637c86f272b78) Thanks [@drewda](https://github.com/drewda)! - Docs: clarify that `NUXT_AUTH0_CLIENT_ID` must be set at build time even when real credentials are supplied only at runtime (e.g. Cloudflare Pages dashboard). Otherwise, placeholders get baked in and runtime env vars are silently ignored.
