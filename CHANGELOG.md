# Changelog

All notable changes are documented here. The project follows Semantic
Versioning and keeps an explicit human-readable release history.

## [Unreleased]

## [1.0.7] - 2026-08-04

### Fixed

- Cache bounded campground metadata and photo responses so repeated campsite
  detail requests do not repeatedly hit Parks Canada's public API.
- Stop upstream traffic for five minutes after an Azure WAF block and return
  concise recovery guidance instead of retrying or exposing the WAF HTML page.

## [1.0.6] - 2026-08-03

### Fixed

- Return campsite photos as native MCP image content so Claude can render them
  inline instead of silently dropping embedded resources.
- Thumbnail photos so a three-image site-detail response remains below Claude
  Desktop's tool-result size limit.
- Use deterministic recorded responses for the packaged release smoke because
  Parks Canada's WAF blocks GitHub-hosted runner IPs.

## [1.0.4] - 2026-08-03

### Security

- Updated `fast-uri` to `3.1.5`, closing its backslash authority host-confusion
  vulnerability.
- Updated Hono to `4.12.34`, closing a CORS middleware denial-of-service
  vulnerability.

## [1.0.3] - 2026-07-31

### Security

- Updated the bundled Hono Node adapter to `2.0.10`, closing its aborted
  WebSocket-handshake memory leak.
- Overrode the build-only `tmp` dependency to `0.2.7`, closing its temporary
  path traversal and symbolic-link write advisories.

## [1.0.2] - 2026-07-31

### Fixed

- Made release checksums use the flat asset names produced by GitHub Releases,
  so a downloaded release verifies directly with `shasum -c SHA256SUMS`.

## [1.0.1] - 2026-07-31

### Fixed

- Matched the case-sensitive MCP Registry namespace and npm ownership metadata
  to the canonical `JCrossman` GitHub account name.

## [1.0.0] - 2026-04-17

### Added

- Trusted MCP form elicitation for every consequential action.
- Complete session and dedicated browser-profile cleanup on disconnect.
- Cancellation and revocation of concurrent sign-in captures during disconnect.
- Atomic, validated alert persistence and retry-safe notification delivery.
- DNS-resolution and redirect defenses for notification targets.
- Locked standalone npm and byte-reproducible `.mcpb` distributions, complete
  bundled-component SBOMs, final-archive audits, checksums, and provenance
  attestations.
- Public privacy, security, compatibility, support, and contribution policies.

### Changed

- Removed model-controlled confirmation booleans and tokens.
- Consequential tools now fail closed on hosts without form elicitation.

[Unreleased]: https://github.com/JCrossman/can-fed-camp-mcp/compare/camping-v1.0.7...HEAD
[1.0.7]: https://github.com/JCrossman/can-fed-camp-mcp/releases/tag/camping-v1.0.7
[1.0.6]: https://github.com/JCrossman/can-fed-camp-mcp/releases/tag/camping-v1.0.6
[1.0.4]: https://github.com/JCrossman/can-fed-camp-mcp/releases/tag/camping-v1.0.4
[1.0.3]: https://github.com/JCrossman/can-fed-camp-mcp/releases/tag/camping-v1.0.3
[1.0.2]: https://github.com/JCrossman/can-fed-camp-mcp/releases/tag/camping-v1.0.2
[1.0.1]: https://github.com/JCrossman/can-fed-camp-mcp/releases/tag/camping-v1.0.1
[1.0.0]: https://github.com/JCrossman/can-fed-camp-mcp/releases/tag/camping-v1.0.0
