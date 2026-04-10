export default defineNuxtConfig({
  modules: [
    '../src/module',
    '@nuxt/devtools',
  ],

  ssr: false,

  tlv2Auth: {
    proxyEnabled: true,
  },

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
    tlv2: {
      proxyBase: {
        default: '',
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
  },
})
