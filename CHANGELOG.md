# Changelog

All notable changes are documented here. The project follows Semantic
Versioning and keeps an explicit human-readable release history.

## [Unreleased]

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

[Unreleased]: https://github.com/JCrossman/can-fed-camp-mcp/compare/camping-v1.0.2...HEAD
[1.0.2]: https://github.com/JCrossman/can-fed-camp-mcp/releases/tag/camping-v1.0.2
[1.0.1]: https://github.com/JCrossman/can-fed-camp-mcp/releases/tag/camping-v1.0.1
[1.0.0]: https://github.com/JCrossman/can-fed-camp-mcp/releases/tag/camping-v1.0.0
