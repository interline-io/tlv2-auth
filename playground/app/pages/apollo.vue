<template>
  <div style="padding: 2rem; font-family: system-ui, sans-serif;">
    <h1>Apollo Test</h1>
    <p style="margin-top: 0.5rem;">
      <NuxtLink to="/">
        ← Playground home
      </NuxtLink>
    </p>

    <div style="margin-top: 1rem;">
      Backend:
      <a href="?backend=default" :style="{ marginLeft: '0.5rem', fontWeight: backend === 'default' ? 'bold' : 'normal' }">default (public)</a>
      <a href="?backend=stationEditor" :style="{ marginLeft: '0.75rem', fontWeight: backend === 'stationEditor' ? 'bold' : 'normal' }">stationEditor (strict)</a>
      <span style="color: #666; font-size: 0.9rem; margin-left: 0.75rem;">
        controls all requests on this page; a full page load, so the SSR query re-runs
      </span>
    </div>

    <section style="margin-top: 1.5rem;">
      <h2>SSR query</h2>
      <p style="color: #666; font-size: 0.9rem;">
        Prefetched on the server through <code>useProxySsrFetch()</code> → in-process loopback →
        proxy (<strong>{{ backend }}</strong> backend). The data is in the server-rendered HTML
        (check view-source), and hydration restores it from the payload cache — no client refetch.
      </p>
      <pre
        style="margin-top: 0.5rem; background: #f4f4f4; padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.85rem; max-height: 400px; overflow-y: auto;"
      >{{ ssrError || ssrResult }}</pre>
    </section>

    <section style="margin-top: 2rem;">
      <h2>Client query</h2>
      <p style="color: #666; font-size: 0.9rem;">
        Fired in the browser on demand (<code>network-only</code>, never SSR), through the
        same-origin proxy (<strong>{{ backend }}</strong> backend) with browser cookies.
        <strong>default</strong> injects the fallback apikey; <strong>stationEditor</strong> is
        strict and errors without a valid token.
      </p>
      <div style="margin-top: 0.5rem;">
        <button :disabled="clientLoading" @click="runClientQuery">
          {{ clientLoading ? 'Loading...' : 'Run client query' }}
        </button>
      </div>
      <pre
        v-if="clientResult !== null"
        style="margin-top: 0.5rem; background: #f4f4f4; padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.85rem; max-height: 400px; overflow-y: auto;"
      >{{ clientResult }}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { gql } from 'graphql-tag'
import { ApolloClients } from '@vue/apollo-composable'
import type { ApolloClient, NormalizedCacheObject } from '@apollo/client/core/index.js'
import { useRoute, useAsyncData } from '#imports'

const QUERY = gql`{ me { id name email roles } feeds(limit: 3) { onestop_id } }`

// The page-wide backend comes from ?backend=; the switch links are plain <a>
// navigations so the SSR query genuinely re-runs against the new backend.
const route = useRoute()
const backend = typeof route.query.backend === 'string' && route.query.backend ? route.query.backend : 'default'

const clients = inject<Record<string, ApolloClient<NormalizedCacheObject>>>(ApolloClients)!

// SSR half: prefetch through the client during server render, catching failures
// so a strict (requireToken) backend returning 401 while unauthenticated renders
// the error instead of aborting the render with a 500 — useQuery's server-prefetch
// rejects on a network error. client.query still populates the InMemoryCache, which
// the apollo plugin snapshots into the payload for client hydration.
const { data: ssr } = await useAsyncData(`apollo-ssr:${backend}`, async () => {
  try {
    const res = await clients[backend]?.query({ query: QUERY, fetchPolicy: 'network-only', errorPolicy: 'all' })
    if (!res) {
      return { data: null, error: `Unknown backend "${backend}"` }
    }
    return { data: res.data ?? null, error: res.error ? String(res.error) : null }
  } catch (e) {
    return { data: null, error: String(e) }
  }
})
const ssrResult = computed(() => ssr.value?.data ? JSON.stringify(ssr.value.data, null, 2) : '(no data)')
const ssrError = computed(() => ssr.value?.error || '')

// Client half: a fresh network-only query fired on demand against the
// page-wide backend, exercising the browser-side path (no SSR involvement).
const clientResult = ref<string | null>(null)
const clientLoading = ref(false)

async function runClientQuery () {
  clientLoading.value = true
  clientResult.value = null
  try {
    const client = clients[backend]
    if (!client) {
      throw new Error(`Unknown backend "${backend}"`)
    }
    const res = await client.query({ query: QUERY, fetchPolicy: 'network-only' })
    clientResult.value = JSON.stringify(res.data, null, 2)
  } catch (e) {
    clientResult.value = String(e)
  } finally {
    clientLoading.value = false
  }
}
</script>
