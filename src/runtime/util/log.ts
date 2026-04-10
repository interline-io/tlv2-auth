export const traceEnabled = process.env.TL_LOG === 'trace'

export function trace (label: string, ...args: any[]) {
  console.log(`[tlv2-auth:trace] ${label}`, ...args)
}

export function traceAccessToken (token: string) {
  const parts = token.split('.')
  trace('accessToken part count:', parts.length, '(3=JWS, 5=JWE)')
  trace('accessToken full value:', token)
  if (parts.length >= 2) {
    try {
      const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString())
      trace('accessToken header (decoded):', header)
    } catch (e: any) {
      trace('accessToken header decode FAILED:', e.message)
      trace('accessToken header raw base64url:', parts[0])
    }
    try {
      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString())
      trace('accessToken payload (decoded):', payload)
    } catch (e: any) {
      trace('accessToken payload decode FAILED (likely encrypted/JWE):', e.message)
      trace('accessToken payload raw base64url:', parts[1])
    }
  }
}
