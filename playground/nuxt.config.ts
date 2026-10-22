export default defineNuxtConfig({
  modules: [
    '../src/module',
  ],

  ssr: true,

  // nuxt depends on @nuxt/devtools and starts it in dev unless told not to.
  devtools: { enabled: false },

  runtimeConfig: {
    // auth0-nuxt (server-only) — maps from NUXT_AUTH0_*
    auth0: {
      domain: '',
      clientId: '',
      clientSecret: '',
      appBaseUrl: '',
      sessionSecret: '',
      audience: '',
    },
    // Proxy backends, mounted at /proxy/{name} (proxyEnabled below). Set a base
    // with NUXT_TLV2PROXY_BACKENDS_<NAME>_BASE.
    tlv2proxy: {
      backends: {
        default: { base: 'https://api.transit.land/api/v2' },
        stationEditor: { base: 'https://saas.transit.land/api/v2', requireToken: true },
      },
    },
    // The playground's own key, which server/plugins/proxy-apikey.ts sends for
    // anonymous callers on the default backend. Set with NUXT_PROXY_APIKEY.
    proxyApikey: '',
    public: {
      tlv2: {
        loginGate: true,
        requireLogin: false,
      },
    },
  },

  compatibilityDate: '2024-11-01',

  typescript: {
    strict: true,
    tsConfig: {
      vueCompilerOptions: {
        strictTemplates: true,
      },
    },
  },

  tlv2Auth: {
    proxyEnabled: true,
  },
})
