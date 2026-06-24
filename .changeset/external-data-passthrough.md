---
'@interline-io/tlv2-auth': minor
---

Plumb the GraphQL `me.external_data` map through to client-side composables. The session endpoint now requests `external_data` alongside id/name/email/roles; the enriched claims include a `tlv2_external_data` field; `useUser()` exposes a new `externalData: Record<string, unknown>` property. The map is passed through verbatim — schema is deployment-specific (e.g. tlserver populates `external_data.gatekeeper` with a JSON-stringified Gatekeeper response); consumers cast or parse as needed.
