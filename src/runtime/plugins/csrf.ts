import { defineNuxtPlugin } from '#app'
import { useCsrf } from '../composables/useCsrf'

// Force the CSRF token into the SSR payload so useCsrf() resolves on the client
// even when no component read it during render.
export default defineNuxtPlugin(() => {
  useCsrf()
})
