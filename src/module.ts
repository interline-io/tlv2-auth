import { defineNuxtModule, addPlugin, createResolver, addImportsDir, addServerHandler, installModule } from '@nuxt/kit'
import { defu } from 'defu'

export interface ModuleOptions {
  proxyBase?: string | Record<string, string>
  requireLogin?: boolean
  loginGate?: boolean
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
  },
  async setup (options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const resolveRuntimeModule = (path: string) => resolver.resolve('./runtime', path)

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
      await installModule('@auth0/auth0-nuxt', {})
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
      route: '/api/auth/session',
      method: 'get',
      handler: resolveRuntimeModule('server/api/auth/session.get')
    })

    // Proxy — routes /api/proxy/{backend}/... to the configured proxyBase for that backend
    addServerHandler({
      route: '/api/proxy/**',
      handler: resolveRuntimeModule('server/api/proxy')
    })
  }
})
