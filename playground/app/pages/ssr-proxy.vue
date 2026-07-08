<template>
  <div style="padding: 2rem; font-family: system-ui, sans-serif;">
    <h1>SSR Proxy Test</h1>
    <p style="color: #666;">
      Rendered on the server via <code>useProxySsrFetch()</code> → <code>/proxy/default</code>
      (in-process loopback; the cookie is forwarded so the proxy resolves the session).
    </p>
    <pre style="background: #f4f4f4; padding: 1rem; border-radius: 4px; overflow-x: auto;">{{ error || result }}</pre>
  </div>
</template>

<script setup lang="ts">
// Exercises the single credential path from the SSR side: during server render,
// loop back through the proxy in-process rather than hitting the backend directly.
const proxyFetch = useProxySsrFetch()
const { data: result, error } = await useAsyncData('ssr-proxy', async () => {
  const res = await proxyFetch('/proxy/default/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ me { id name email roles } feeds { onestop_id } }' })
  })
  return { status: res.status, body: await res.json().catch(() => null) }
})
</script>
