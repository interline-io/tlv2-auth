export default defineNuxtConfig({
  modules: [
    '../src/module',
    '@nuxt/devtools',
  ],

  ssr: true,

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
    // Proxy backends — the module auto-registers these at /proxy/{name}. Set
    // values via NUXT_TLV2PROXY_BACKENDS_<NAME>_<FIELD> (e.g. _DEFAULT_APIKEY).
    tlv2proxy: {
      backends: {
        default: { base: 'https://api.transit.land/api/v2', apikey: '' },
        stationEditor: { base: 'https://saas.transit.land/api/v2', requireToken: true },
      },
    },
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
  }
})
