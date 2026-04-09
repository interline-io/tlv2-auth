import { defineNuxtModule, addPlugin, addServerPlugin, createResolver, addImportsDir, addServerHandler, installModule } from '@nuxt/kit'
import { defu } from 'defu'
import { DEFAULT_AUTH_PREFIX, DEFAULT_PROXY_PREFIX } from './runtime/util/defaults'

export interface ModuleOptions {
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

    // CSRF protection (required for all requests, including unauthenticated)
    await installModule('nuxt-csurf', { addCsrfTokenToEventCtx: true })

    // Auth via auth0-nuxt (server-side sessions with HTTP-only cookies).
    // Only installed when clientId is configured — auth0-nuxt hard fails without it.
    // When installed, a server middleware populates event.context.auth0Session
    // so that useAuth0Session() can read it without importing auth0 directly.
    const auth0ClientId = process.env.NUXT_AUTH0_CLIENT_ID || nuxt.options.runtimeConfig.auth0?.clientId
    if (auth0ClientId) {
      // Generate an ephemeral session secret if not provided (useful for local dev)
      if (!process.env.NUXT_AUTH0_SESSION_SECRET && !nuxt.options.runtimeConfig.auth0?.sessionSecret) {
        const { randomBytes } = await import('node:crypto')
        const secret = randomBytes(32).toString('hex')
        nuxt.options.runtimeConfig.auth0 = nuxt.options.runtimeConfig.auth0 || {} as any
        nuxt.options.runtimeConfig.auth0.sessionSecret = secret
        console.warn('[tlv2-auth] No NUXT_AUTH0_SESSION_SECRET provided — using ephemeral secret (sessions won\'t survive restarts)')
      }
      // Synchronous Nitro plugin that ensures auth0ClientOptions is set on
      // each request. No-ops when auth0-nuxt's async plugin already ran.
      // Required for Cloudflare Workers compatibility where async Nitro
      // plugins don't complete before the first request.
      nuxt.options.runtimeConfig.tlv2 = defu(nuxt.options.runtimeConfig.tlv2 as any, {
        autoAppBaseUrl: options.autoAppBaseUrl,
      })
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
    }

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

    // Setup plugins (run in order added — auth/CSRF must be before Apollo)
    addPlugin(resolveRuntimeModule('plugins/auth.server'))
    addPlugin(resolveRuntimeModule('plugins/csrf.client'))
    addPlugin(resolveRuntimeModule('plugins/auth-enrich.client'))

    addImportsDir(resolveRuntimeModule('composables'))

    // Session endpoint for ssr:false apps to fetch user claims client-side
    addServerHandler({
      route: `${authPrefix}/session`,
      method: 'get',
      handler: resolveRuntimeModule('server/api/auth/session.get')
    })

    // Proxy — routes /{proxyPrefix}/{backend}/... to the configured proxyBase for that backend.
    // Enforce CSRF on ALL methods (including GET) because the proxy injects
    // server-side credentials (API key, JWT) — without CSRF, a cross-origin
    // request could ride the user's session cookies to abuse those credentials.
    nuxt.options.routeRules = defu(
      // nuxt-csurf augments NitroRouteConfig with `csurf`, but the types
      // aren't visible until the module is installed at runtime.
      { [`${proxyPrefix}/**`]: { csurf: { methodsToProtect: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] } } } as Record<string, any>,
      nuxt.options.routeRules
    )
    addServerHandler({
      route: `${proxyPrefix}/**`,
      handler: resolveRuntimeModule('server/api/proxy')
    })
  }
})
