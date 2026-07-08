// Server-side entry point: `import { defineProxyBackend, proxyEventHandler } from '@interline-io/tlv2-auth/server'`.
// Never import this from client/universal code — it carries the proxy registry,
// which holds API keys.
export { defineProxyBackend } from './proxy-registry'
export type { ProxyBackend } from './proxy-registry'

// The proxy dispatch handler. Mount it from a consumer route file, e.g.
// `server/routes/proxy/[...].ts`: `export { proxyEventHandler as default } from '@interline-io/tlv2-auth/server'`.
export { default as proxyEventHandler } from './api/proxy'
