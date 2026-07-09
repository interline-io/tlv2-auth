import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client/core/index.js'
import type { NormalizedCacheObject } from '@apollo/client/core/index.js'
// @ts-expect-error - apollo-upload-client does not provide TypeScript definitions
import createUploadLink from 'apollo-upload-client/createUploadLink.mjs'
import { ApolloClients, provideApolloClients } from '@vue/apollo-composable'
import { defineNuxtPlugin, useApiEndpoint, useProxySsrFetch } from '#imports'

// SSR only: a failed backend response (e.g. a requireToken backend 401 for an
// unauthenticated request) reaches Apollo as a network error, which rejects
// useQuery's server-prefetch and 500s the whole render. Re-emit it as a
// result-with-errors so — paired with errorPolicy 'all' below — the query
// resolves and the error surfaces via useQuery's `error` instead of crashing the
// page. The client link is untouched, so client-side error handling is unchanged.
const ssrErrorToResult = new ApolloLink((operation, forward) =>
  new Observable((observer) => {
    const sub = forward(operation).subscribe({
      next: result => observer.next(result),
      error: (err) => {
        observer.next({ data: null, errors: [{ message: err?.message ?? String(err) }] })
        observer.complete()
      },
      complete: () => observer.complete()
    })
    return () => sub.unsubscribe()
  })
)

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

    const uploadLink = createUploadLink({
      uri: useApiEndpoint('/query', id),
      credentials: 'same-origin',
      ...(ssrFetch ? { fetch: ssrFetch } : {}),
    })

    clients[id] = new ApolloClient({
      // On the server, front the http link with ssrErrorToResult so a backend
      // failure renders instead of 500ing; errorPolicy 'all' lets useQuery deliver
      // that error result rather than reject. Both apply to every query — no
      // per-query changes needed.
      link: import.meta.server ? ApolloLink.from([ssrErrorToResult, uploadLink]) : uploadLink,
      cache,
      ssrMode: import.meta.server,
      defaultOptions: { watchQuery: { errorPolicy: 'all' } },
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
