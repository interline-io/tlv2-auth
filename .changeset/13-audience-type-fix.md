---
'@interline-io/tlv2-auth': patch
---

Register `audience` in the auth0 runtimeConfig schema so consuming apps can set `NUXT_AUTH0_AUDIENCE` without a type error during `nuxt build`.

Replace `addImportsDir` with explicit `addImports` to eliminate "Duplicated imports" warnings.
