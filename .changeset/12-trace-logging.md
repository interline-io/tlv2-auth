---
'@interline-io/tlv2-auth': patch
---

Add opt-in trace logging gated behind `TL_LOG=trace`. Uses a guard pattern (`if (traceEnabled)`) to avoid argument evaluation when tracing is off. Covers the auth0 middleware, session endpoint, proxy handler, and SSR auth header injection.

Enable the proxy in the playground and add a proxy test UI for exercising the full auth flow locally.
