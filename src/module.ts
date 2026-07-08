import { defineNuxtModule, addPlugin, addServerPlugin, createResolver, addImports, addServerHandler, installModule } from '@nuxt/kit'
import { defu } from 'defu'
import { DEFAULT_AUTH_PREFIX, DEFAULT_PROXY_PREFIX, AUTH0_PLACEHOLDER_DOMAIN } from './runtime/util/defaults'

export interface ModuleOptions {
  requireLogin?: boolean
  loginGate?: boolean
  /** URL prefix for auth routes (login, logout, session). Default: '/auth' */
  authPrefix?: string
  /**
   * Mount the API proxy at `proxyPrefix`. Off by default — the proxy injects
   * server-side credentials, so it must be explicitly opted into (and backends
   * configured) to be reachable.
   */
  proxyEnabled?: boolean
  /** URL prefix for proxy requests. Default: '/proxy' */
  proxyPrefix?: string
  /**
   * Derive auth0 appBaseUrl from the request Host header instead of using
   *  the static NUXT_AUTH0_APP_BASE_URL value. Useful for branch/preview
   *  deploys where the URL isn't known at build time (e.g. Cloudflare Pages,
   *  Vercel preview deployments).
   */
  autoAppBaseUrl?: boolean
}

function normalizePrefix (value: string): string {
  const raw = value.replace(/\/+$/, '')
  if (!raw.startsWith('/')) {
    throw new Error(`[tlv2-auth] Route prefix must start with "/", got: "${raw}"`)
  }
  return raw
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'tlv2-auth',
    configKey: 'tlv2Auth',
    compatibility: {
      nuxt: '^4.0.0'
    }
  },
  defaults: {
    requireLogin: false,
    loginGate: false,
    proxyEnabled: false,
    authPrefix: DEFAULT_AUTH_PREFIX,
    proxyPrefix: DEFAULT_PROXY_PREFIX,
    autoAppBaseUrl: false,
  },
  async setup (options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const resolveRuntimeModule = (path: string) => resolver.resolve('./runtime', path)

    const authPrefix = normalizePrefix(options.authPrefix!)
    const proxyPrefix = normalizePrefix(options.proxyPrefix!)

    // Auth via auth0-nuxt (server-side sessions). Always installed so auth0
    // config is purely a runtime concern (NUXT_AUTH0_*). With no clientId at
    // runtime, seed all auth0 fields with placeholders (all-or-nothing) so the
    // server starts unauthenticated and treats everyone as anonymous.
    const { randomBytes } = await import('node:crypto')
    // Register `audience` in the runtimeConfig schema so that consuming apps
    // can set NUXT_AUTH0_AUDIENCE without a type error.  auth0-nuxt's module
    // doesn't declare this key, but its server composable reads it from
    // runtimeConfig.auth0.audience at runtime.
    nuxt.options.runtimeConfig.auth0 = defu(nuxt.options.runtimeConfig.auth0 as any, {
      audience: '',
    }) as any

    const auth0ClientId = process.env.NUXT_AUTH0_CLIENT_ID || nuxt.options.runtimeConfig.auth0?.clientId
    if (!auth0ClientId) {
      // No clientId — seed all auth0 config with placeholders so the server
      // can start without auth credentials.
      nuxt.options.runtimeConfig.auth0 = {
        ...nuxt.options.runtimeConfig.auth0,
        domain: AUTH0_PLACEHOLDER_DOMAIN,
        clientId: AUTH0_PLACEHOLDER_DOMAIN,
        clientSecret: AUTH0_PLACEHOLDER_DOMAIN,
        appBaseUrl: 'http://localhost:3000',
        sessionSecret: randomBytes(32).toString('hex'),
      } as any
    } else if (!process.env.NUXT_AUTH0_SESSION_SECRET && !nuxt.options.runtimeConfig.auth0?.sessionSecret) {
      if (nuxt.options.dev) {
        // Dev only: generate an ephemeral session secret so devs don't need
        // to set one locally (and won't be tempted to copy the prod value).
        nuxt.options.runtimeConfig.auth0 = nuxt.options.runtimeConfig.auth0 || {} as any
        nuxt.options.runtimeConfig.auth0.sessionSecret = randomBytes(32).toString('hex')
        console.warn('[tlv2-auth] No NUXT_AUTH0_SESSION_SECRET provided — using ephemeral secret (sessions won\'t survive restarts)')
      }
      // In production, let auth0-nuxt's own validation crash with a clear error.
    }

    nuxt.options.runtimeConfig.tlv2 = defu(nuxt.options.runtimeConfig.tlv2 as any, {
      autoAppBaseUrl: options.autoAppBaseUrl,
    })
    // Synchronous Nitro plugin that ensures auth0ClientOptions is set on
    // each request. No-ops when auth0-nuxt's async plugin already ran.
    // Required for Cloudflare Workers compatibility where async Nitro
    // plugins don't complete before the first request.
    addServerPlugin(resolveRuntimeModule('server/plugins/auth0-init'))
    await installModule('@auth0/auth0-nuxt', {
      routes: {
        login: `${authPrefix}/login`,
        logout: `${authPrefix}/logout`,
        callback: `${authPrefix}/callback`,
        backchannelLogout: `${authPrefix}/backchannel-logout`,
      }
    })
    addServerHandler({
      middleware: true,
      handler: resolveRuntimeModule('server/middleware/auth0')
    })

    // Private per-backend proxy config (base + apikey + policy, keyed by name).
    // The `default` backend also serves /auth/session enrichment and SSR injection.
    Object.assign(nuxt.options.runtimeConfig, defu(nuxt.options.runtimeConfig, {
      tlv2proxy: {
        backends: {},
      },
      // Legacy migration bridge (see resolveProxyBackends); only `default` binds
      // via env, so consumers with more backends declare them in tlv2proxy.backends.
      tlv2: {
        graphqlApikey: '',
        proxyBase: { default: '' },
      },
    }))

    // Public runtime options (available on both server and client)
    Object.assign(nuxt.options.runtimeConfig.public, defu(
      nuxt.options.runtimeConfig.public,
      {
        tlv2: {
          loginGate: options.loginGate,
          requireLogin: options.requireLogin,
          authPrefix,
        },
        tlv2proxy: {
          prefix: proxyPrefix,
        }
      }
    ))

    // Setup plugins
    addPlugin(resolveRuntimeModule('plugins/auth-enrich.client'))

    addImports([
      { name: 'useUser', from: resolveRuntimeModule('composables/useUser') },
      { name: 'useLogin', from: resolveRuntimeModule('composables/useLogin') },
      { name: 'useLogout', from: resolveRuntimeModule('composables/useLogout') },
      { name: 'useApiEndpoint', from: resolveRuntimeModule('composables/useApiEndpoint') },
      { name: 'useProxySsrFetch', from: resolveRuntimeModule('composables/useProxySsrFetch') },
    ])

    // Session endpoint for ssr:false apps to fetch user claims client-side
    addServerHandler({
      route: `${authPrefix}/session`,
      method: 'get',
      handler: resolveRuntimeModule('server/api/auth/session.get')
    })

    // Mount the proxy only when explicitly enabled — it injects server-side
    // credentials, so legacy env vars alone must not expose it. Anti-abuse gating
    // is the consuming app's job (see PROXY.md); unconfigured backends 404.
    if (options.proxyEnabled) {
      // Log the resolved proxy backends once at server startup (no secrets).
      addServerPlugin(resolveRuntimeModule('server/plugins/log-proxy-backends'))
      addServerHandler({
        route: `${proxyPrefix}/**`,
        handler: resolveRuntimeModule('server/api/proxy')
      })
    }
  }
})
