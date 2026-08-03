# Releasing

Releases follow Semantic Versioning. Breaking tool contracts or confirmation
semantics require a major release; backward-compatible tools use a minor
release; fixes use a patch release. `@open-state/kit` is pinned exactly because
its approval API is a constitutional security boundary.

## Prepare

1. Update `CHANGELOG.md`.
2. Set the same version in the root and bundle `package.json` files,
   `packages/bundle/manifest.json`, `packages/bundle/src/version.ts`, and
   `server.json`.
3. Pin all dependency and workflow-action versions; run `pnpm install` and
   commit the resulting lockfile.
4. Run:

   ```bash
   pnpm check:pii
   pnpm check:lockfile
   pnpm -r build
   pnpm -r test
   pnpm --filter @open-state/camping pack:mcpb
   pnpm audit:bundle
   pnpm smoke:bundle
   pnpm smoke:npm
   pnpm check:reproducible
   mcp-publisher validate server.json
   ```

5. Merge through a pull request after the Ubuntu, macOS, Windows, CodeQL, and
   security reviews pass.

## Publish

The `camping-vX.Y.Z` tag must point to the reviewed merge commit and match every
version above. The protected `public-release` environment requires maintainer
approval. Its workflow:

- rebuilds and tests from the frozen lockfile;
- creates a byte-reproducible `.mcpb`, inventory, CycloneDX SBOM, checksums, and
  GitHub build/SBOM attestations;
- publishes `@open-state/camping` to npm with provenance;
- creates the immutable GitHub release; and
- publishes `server.json` to the official MCP Registry using GitHub OIDC.

npm publication uses Trusted Publishing for repository
`JCrossman/can-fed-camp-mcp`, workflow `release-mcpb.yml`, and environment
`public-release`. Traditional token-based publishing is disabled.

Never publish from an unreviewed branch, a local dirty tree, or a mutable
dependency install. If any publish step fails, do not move or recreate the tag;
fix forward with a new version.
