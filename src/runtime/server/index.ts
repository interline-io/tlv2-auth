// Server-side entry point: `import { defineProxyBackend } from '@interline-io/tlv2-auth/server'`.
// Never import this from client/universal code — it carries the proxy registry,
// which holds API keys.
export { defineProxyBackend } from './proxy-registry'
export type { ProxyBackend } from './proxy-registry'
