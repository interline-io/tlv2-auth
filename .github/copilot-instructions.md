# tlv2-auth

Nuxt 4 module published to GitHub Packages as `@interline-io/tlv2-auth`. The module source lives at the repo root (`src/`), with a `playground/` workspace for local development.

## Commands

```bash
pnpm install          # Install (requires NODE_AUTH_TOKEN for GitHub Packages)
pnpm dev              # Start playground dev server (http://localhost:3000)
pnpm build            # Build the module
pnpm test             # Run all tests (vitest)
pnpm lint             # ESLint
```

## Making changes

Always add a changeset when modifying the package:

```bash
pnpm changeset        # Describe the change and choose semver bump (patch/minor/major)
```

This creates a file in `.changeset/` that should be committed with your PR. Without it, your change won't trigger a version bump or CHANGELOG entry.

## Release workflow

Changesets drives versioning and publishing:

1. PRs include a `.changeset/*.md` file (created by `pnpm changeset`)
2. On merge to `main`, the `@changesets/action` bot opens or updates a **"Version Packages"** PR that bumps versions and generates CHANGELOGs
3. Merging the Version Packages PR triggers publish to GitHub Packages

Every push to `main` also publishes a SHA pre-release (`0.0.0-sha.<sha>`) for internal testing.

## Architecture

- `src/module.ts` — Nuxt module entry point
- `src/runtime/` — composables, plugins, server routes, and utilities
- `playground/` — dev environment for testing the auth module (pnpm workspace package)
- `.changeset/config.json` — changesets config (`access: "public"` for GitHub Packages)

## Package manager

Requires pnpm. Authenticate with GitHub Packages:

```bash
NODE_AUTH_TOKEN=<github-pat> pnpm install
```

The token needs `read:packages` scope (and `write:packages` to publish).

## Pull requests

When creating pull requests, always use `--draft`.

## Error handling

- Never write empty catch blocks or silently discard errors. Every catch block must log the error with enough context to diagnose the problem (e.g. `console.warn` with what failed and why). Silent failures hide bugs and make debugging impossible.
- Keep try/catch blocks minimal — wrap only the single failable action, not surrounding logic.

## PR Summary

When asked to "generate PR summary", run `git diff main...HEAD` and `git log main..HEAD --oneline` to analyze all changes on the current branch, then output a GitHub-flavored markdown PR description wrapped in a fenced code block so it can be copy-pasted. No emojis, no checklists. Use this structure:

```
## Summary
<high-level one paragraph description of the PR>

### <theme 1>
<bulleted details>

### <theme 2>
<bulleted details>

## Test plan
<manual verification steps relevant to the changes; do not include pnpm test/lint/typecheck as those are handled by CI>
```
