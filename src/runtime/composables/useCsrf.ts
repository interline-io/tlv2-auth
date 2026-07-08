import { useState, useRequestEvent } from '#imports'
import { CSRF_HEADER, CSRF_STATE_KEY } from '../util/csrf'

// The double-submit CSRF token for this session and the header to send it under.
// Echo it on unsafe-method proxy requests (Apollo mutations, REST writes); safe
// GETs (tiles, downloads, links) ride the cookie and don't need it.
export function useCsrf () {
  const token = useState<string>(CSRF_STATE_KEY, () => {
    if (import.meta.server) {
      const event = useRequestEvent()
      return (event?.context?.tlv2Csrf as string) || ''
    }
    return ''
  })
  return { token, headerName: CSRF_HEADER }
}
