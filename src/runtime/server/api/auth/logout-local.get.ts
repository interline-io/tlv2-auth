import { defineEventHandler, parseCookies, deleteCookie, sendRedirect } from 'h3'

// Local logout: clears this app's auth0 session cookies and redirects home,
// without auth0's federated /oidc/logout round-trip. The SSO session survives,
// so the next login completes silently. Used for the degraded-session fallback,
// where a full federated logout is too heavy.
export default defineEventHandler((event) => {
  // auth0-server-js stores the (chunked) session under `__a0_session` /
  // `__a0_session.<n>` (its default stateIdentifier). Clear the base name and
  // every chunk; path '/' matches how they were set so the browser drops them.
  for (const name of Object.keys(parseCookies(event))) {
    if (name === '__a0_session' || name.startsWith('__a0_session.')) {
      deleteCookie(event, name, { path: '/' })
    }
  }
  return sendRedirect(event, '/')
})
