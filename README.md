# tlv2-auth

Nuxt 4 module providing authentication, CSRF protection, and API proxying for Transitland v2 applications. Published to GitHub Packages as `@interline-io/tlv2-auth`.

See [packages/tlv2-auth/README.md](packages/tlv2-auth/README.md) for full documentation, usage, and composable reference.

## Development

```bash
pnpm install          # Install (requires NODE_AUTH_TOKEN for GitHub Packages)
pnpm dev              # Start playground dev server (http://localhost:3000)
pnpm build            # Build the package
pnpm test             # Run tests (vitest)
pnpm lint             # ESLint
```

Copy `playground/.env.example` to `playground/.env` and fill in your Auth0 and API credentials to test the full login flow.

## Release workflow

Changesets drives versioning and publishing:

1. PRs include a `.changeset/*.md` file (created by `pnpm changeset`)
2. On merge to `main`, the `@changesets/action` bot opens or updates a **"Version Packages"** PR that bumps versions and generates CHANGELOGs
3. Merging the Version Packages PR triggers publish to GitHub Packages

Every push to `main` also publishes a SHA pre-release (`0.0.0-sha.<sha>`) for internal testing.
