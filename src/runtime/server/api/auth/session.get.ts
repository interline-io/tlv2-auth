import { defineEventHandler } from 'h3'
import { useRuntimeConfig } from '#imports'
import { getSessionUser } from '../../sessionUser'

// Returns the current user's session claims enriched with roles from the
// GraphQL `me` endpoint. Returns null if not logged in. Fetched client-side by
// the auth plugin to populate user state — the primary path when SSR is
// disabled (ssr: false); with SSR on, auth-enrich.server seeds roles instead.
export default defineEventHandler((event) => {
  return getSessionUser(event, useRuntimeConfig(event))
})
