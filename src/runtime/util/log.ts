export const traceEnabled = process.env.TL_LOG === 'trace'

export function trace (label: string, ...args: any[]) {
  console.log(`[tlv2-auth:trace] ${label}`, ...args)
}
