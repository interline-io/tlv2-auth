import { ApolloClient, InMemoryCache } from '@apollo/client/core/index.js'
import type { NormalizedCacheObject } from '@apollo/client/core/index.js'
// @ts-expect-error - apollo-upload-client does not provide TypeScript definitions
import createUploadLink from 'apollo-upload-client/createUploadLink.mjs'
import { ApolloClients, provideApolloClients } from '@vue/apollo-composable'
import { defineNuxtPlugin, useApiEndpoint, useProxySsrFetch } from '#imports'

// Mirrors the consuming-app wiring: one Apollo client per proxy backend.
// Components pass a clientId to resolve the matching client; everything else
// uses 'default'. Each id must have an entry in runtimeConfig.tlv2proxy.backends.
//
// Auth is handled entirely by the tlv2-auth proxy: clients forward the
// same-origin session cookie and never set Authorization headers themselves.
const BACKENDS = ['default', 'stationEditor'] as const

// Where each backend's SSR cache snapshot lives in the Nuxt payload.
const cacheKey = (id: string) => `_apollo:${id}`

export default defineNuxtPlugin((nuxtApp) => {
  const clients: Record<string, ApolloClient<NormalizedCacheObject>> = {}

  // During SSR there's no browser to carry cookies; loop back through the
  // proxy in-process so the session resolves. On the client the link uses the
  // browser's fetch with same-origin cookies.
  const ssrFetch = import.meta.server ? useProxySsrFetch() : undefined

  for (const id of BACKENDS) {
    const cache = new InMemoryCache()

    // Client: restore the server-rendered cache before any query runs, so
    // hydrated queries resolve from cache instead of refetching.
    if (import.meta.client) {
      const state = nuxtApp.payload.data[cacheKey(id)] as NormalizedCacheObject | undefined
      if (state) {
        cache.restore(state)
      }
    }

    clients[id] = new ApolloClient({
      link: createUploadLink({
        uri: useApiEndpoint('/query', id),
        credentials: 'same-origin',
        ...(ssrFetch ? { fetch: ssrFetch } : {}),
      }),
      cache,
      ssrMode: import.meta.server,
    })
  }

  // Server: snapshot each cache into the payload after render so the client
  // can rehydrate it.
  if (import.meta.server) {
    nuxtApp.hook('app:rendered', () => {
      for (const [id, client] of Object.entries(clients)) {
        nuxtApp.payload.data[cacheKey(id)] = client.cache.extract()
      }
    })
  }

  // Provide per request via Vue injection (SSR-safe — each request gets its
  // own Vue app). provideApolloClients sets a module-level global that would
  // leak across concurrent SSR requests, so only register it on the client.
  nuxtApp.vueApp.provide(ApolloClients, clients)
  if (import.meta.client) {
    provideApolloClients(clients)
  }
})
