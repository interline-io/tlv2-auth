// Sends the playground's key with anonymous requests on the default backend, the
// way an app attaches its own key through the tlv2proxy:request hook.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('tlv2proxy:request', (request) => {
    if (request.backend === 'default' && request.credential === 'none') {
      request.apikey = useRuntimeConfig(request.event).proxyApikey
    }
  })
})
