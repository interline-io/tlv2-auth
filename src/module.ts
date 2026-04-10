import { defineNuxtModule, addPlugin, addServerPlugin, createResolver, addImportsDir, addServerHandler, installModule } from '@nuxt/kit'
import { defu } from 'defu'
import { DEFAULT_AUTH_PREFIX, DEFAULT_PROXY_PREFIX, AUTH0_PLACEHOLDER_DOMAIN } from './runtime/util/defaults'

export interface ModuleOptions {
  /** Enable the API proxy. Default: false */
  proxyEnabled?: boolean
  proxyBase?: string | Record<string, string>
  requireLogin?: boolean
  loginGate?: boolean
  /** URL prefix for auth routes (login, logout, session). Default: '/auth' */
  authPrefix?: string
  /** URL prefix for the proxy route. Default: '/proxy' */
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
    proxyEnabled: false,
    requireLogin: false,
    loginGate: false,
    authPrefix: DEFAULT_AUTH_PREFIX,
    proxyPrefix: DEFAULT_PROXY_PREFIX,
    autoAppBaseUrl: false,
  },
  async setup (options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const resolveRuntimeModule = (path: string) => resolver.resolve('./runtime', path)

    const authPrefix = normalizePrefix(options.authPrefix!)
    const proxyPrefix = normalizePrefix(options.proxyPrefix!)

    // Auth via auth0-nuxt (server-side sessions with HTTP-only cookies).
    // Always installed at build time so auth0 credentials are purely a runtime
    // concern (NUXT_AUTH0_* env vars). When credentials are absent at runtime
    // (e.g. automated browser tests), the auth middleware no-ops and all users
    // are treated as anonymous — the proxy and other features still work.
    //
    // auth0-nuxt's server plugin validates that domain/clientId/clientSecret/
    // appBaseUrl/sessionSecret are non-empty at startup. When no clientId is
    // provided, we seed all auth0 config with placeholders so the server can
    // start without auth. This is all-or-nothing to avoid a partial state
    // where some values are real and others are placeholders.
    const { randomBytes } = await import('node:crypto')
    const auth0ClientId = process.env.NUXT_AUTH0_CLIENT_ID || nuxt.options.runtimeConfig.auth0?.clientId
    if (!auth0ClientId) {
      // No clientId — seed all auth0 config with placeholders so the server
      // can start without auth credentials.
      nuxt.options.runtimeConfig.auth0 = {
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

    // Private runtime options (server-side only)
    Object.assign(nuxt.options.runtimeConfig, defu(nuxt.options.runtimeConfig, {
      tlv2: {
        graphqlApikey: '',
        proxyBase: typeof options.proxyBase === 'string'
          ? { default: options.proxyBase }
          : (options.proxyBase || {}),
      }
    }))

    // Public runtime options (available on both server and client)
    Object.assign(nuxt.options.runtimeConfig.public, defu(
      nuxt.options.runtimeConfig.public,
      {
        tlv2: {
          loginGate: options.loginGate,
          requireLogin: options.requireLogin,
          authPrefix,
          proxyPrefix,
        }
      }
    ))

    // Setup plugins
    addPlugin(resolveRuntimeModule('plugins/auth.server'))
    addPlugin(resolveRuntimeModule('plugins/auth-enrich.client'))

    addImportsDir(resolveRuntimeModule('composables'))

    // Session endpoint for ssr:false apps to fetch user claims client-side
    addServerHandler({
      route: `${authPrefix}/session`,
      method: 'get',
      handler: resolveRuntimeModule('server/api/auth/session.get')
    })

    // Proxy — only registered when explicitly enabled.
    if (options.proxyEnabled) {
      addServerHandler({
        route: `${proxyPrefix}/**`,
        handler: resolveRuntimeModule('server/api/proxy')
      })
    }
  }
})
