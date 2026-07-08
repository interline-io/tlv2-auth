<template>
  <div style="padding: 2rem; font-family: system-ui, sans-serif;">
    <h1>Vanilla Fetch Test</h1>
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
        controls all requests on this page; a full page load, so the SSR test re-runs
      </span>
    </div>

    <section style="margin-top: 2rem;">
      <h2>Client fetch</h2>
      <p style="color: #666; font-size: 0.9rem;">
        Sends a GraphQL query through the proxy with plain <code>fetch()</code>.
        <strong>default</strong> injects a fallback apikey (works logged-out);
        <strong>stationEditor</strong> is strict — it returns 401 without a valid token.
      </p>
      <div style="margin-top: 0.5rem;">
        <label>
          Query:
          <input
            v-model="proxyQuery"
            type="text"
            style="width: 100%; padding: 0.4rem; font-family: monospace; margin-top: 0.25rem;"
          >
        </label>
      </div>
      <div style="margin-top: 0.5rem;">
        <button :disabled="proxyLoading" @click="runProxyQuery">
          {{ proxyLoading ? 'Loading...' : 'Send via Proxy' }}
        </button>
      </div>
      <div v-if="proxyStatus" style="margin-top: 0.75rem;">
        <p>
          Status: <strong :style="{ color: proxyStatus >= 400 ? 'red' : 'green' }">{{ proxyStatus }}</strong>
        </p>
      </div>
      <pre
        v-if="proxyResult !== null"
        style="margin-top: 0.5rem; background: #f4f4f4; padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.85rem; max-height: 400px; overflow-y: auto;"
      >{{ proxyResult }}</pre>
    </section>

    <section style="margin-top: 2rem;">
      <h2>SSR fetch</h2>
      <p style="color: #666; font-size: 0.9rem;">
        Rendered on the server via <code>useProxySsrFetch()</code> → <code>/proxy/{{ backend }}</code>
        (in-process loopback; the cookie is forwarded so the proxy resolves the session).
      </p>
      <pre
        style="margin-top: 0.5rem; background: #f4f4f4; padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.85rem; max-height: 400px; overflow-y: auto;"
      >{{ ssrError || ssrResult }}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useApiEndpoint, useProxySsrFetch, useAsyncData, useRoute } from '#imports'

// The page-wide backend comes from ?backend=; the switch links are plain <a>
// navigations so the SSR test genuinely re-runs against the new backend.
const route = useRoute()
const backend = typeof route.query.backend === 'string' && route.query.backend ? route.query.backend : 'default'

// Exercises the SSR side of the single credential path: during server render,
// loop back through the proxy in-process rather than hitting the backend
// directly. The result rides the payload; the client never re-runs it.
const proxyFetch = useProxySsrFetch()
const { data: ssrResult, error: ssrError } = await useAsyncData(`ssr-proxy:${backend}`, async () => {
  const res = await proxyFetch(`/proxy/${backend}/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ me { id name email roles } feeds { onestop_id } }' })
  })
  return { status: res.status, body: await res.json().catch(() => null) }
})

const proxyQuery = ref('{ me { id name email roles } feeds { onestop_id } }')
const proxyResult = ref<string | null>(null)
const proxyStatus = ref<number | null>(null)
const proxyLoading = ref(false)

async function runProxyQuery () {
  proxyLoading.value = true
  proxyResult.value = null
  proxyStatus.value = null
  try {
    const url = useApiEndpoint('/query', backend)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: proxyQuery.value })
    })
    proxyStatus.value = response.status
    const text = await response.text()
    try {
      proxyResult.value = JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      proxyResult.value = text
    }
  } catch (e: any) {
    proxyResult.value = `Fetch error: ${e.message}`
  } finally {
    proxyLoading.value = false
  }
}
</script>
