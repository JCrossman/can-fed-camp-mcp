# Threat model

This document describes the security and privacy boundaries for **The Open
State: Camping**. It is reviewed against The Open State Constitution v1.1,
especially Articles 1, 2, 5, 7, 9, and 10.

## Scope and security objectives

The bundle is a local stdio MCP server running on a citizen-controlled device.
It searches Parks Canada's public reservation APIs and, after explicit citizen
confirmation, uses the citizen's own captured session to prepare a cart. It
never enters payment information or completes payment.

The primary objectives are:

1. Government credentials and session material never reach the model,
   implementer infrastructure, logs, tool output, or release artifacts.
2. Every consequential action is bound to a plain-language preview and an
   explicit, exact, expiring, single-use confirmation.
3. A disconnect removes all authentication state managed by this application.
4. Accessibility and saved-search data are minimized, local, visible, and
   deletable.
5. Upstream failures, local corruption, and notification failures are visible.
6. Public artifacts are reproducible and traceable to reviewed source.

## Actors

| Actor | Trust |
|---|---|
| Citizen | Authoritative decision-maker; controls the device and account |
| MCP host and language model | Untrusted for authorization; may make mistakes or process injected content |
| Local MCP process | Trusted only to enforce this documented design |
| Dedicated Chrome profile | Sensitive local authentication boundary |
| Parks Canada reservation service | Required external service; responses are untrusted input |
| ntfy service or configured notification host | Optional external destination; receives only alert text |
| npm, GitHub Actions, and GitHub Releases | Supply-chain infrastructure; artifacts require independent provenance |
| Maintainer | May publish code but must never receive citizen sessions or personal data |

## Protected assets

- Parks Canada cookies, XSRF token, and browser storage.
- The local vault encryption key and encrypted session.
- Citizen profile fields returned by Parks Canada.
- Booking selections and prepared cart identifiers.
- Alert searches, including accessibility preferences and private ntfy topics.
- Trusted host approval responses.
- Release signing identity and package-publishing credentials.

## Trust boundaries and data flows

### Anonymous search

The MCP host sends validated search arguments to the local server. The server
requests public catalog and availability data from
`https://reservation.pc.gc.ca`, normalizes it, and returns plain-language
results. Upstream text and metadata are data, never instructions.

### Account connection

The local server opens a dedicated Chrome profile. The citizen authenticates
directly with Parks Canada. The server captures cookies only after the service
reports a signed-in session and encrypts them in the local vault. Cookie values
must never appear in MCP results, diagnostics, exceptions, or logs. Disconnect
cancels and closes active captures; a revocation generation prevents a capture
that completed concurrently from saving stale cookies afterward.

### Consequential actions

The tool validates and prepares an action without changing upstream or local
state, then snapshots the arguments and prepared outcome. MCP form elicitation
asks the trusted host to show the exact plain-language preview directly to the
citizen. Tool arguments, model prose, and annotations are not authorization.
Only an explicit host-reported acceptance may execute, and the server rechecks
that the citizen/session context is unchanged after review. A host without
elicitation support fails closed.

### Booking

After valid confirmation, the server creates a Parks Canada cart, commits only
the pre-payment booking stages, verifies the cart when possible, and opens the
citizen's browser. Payment remains a citizen-operated browser step. The server
must never call a completed-payment endpoint or handle card data.

### Alerts

Alert searches are stored locally with an optional allow-listed notification
URL. The poller runs only while the MCP process is connected. It sends a
minimal opening message and retires the alert only after successful delivery.
Malformed storage and delivery failures remain visible.

### Release

Protected tags initiate a least-privilege release workflow and must point to a
commit reachable from protected `main`. Runtime code is bundled only from the
frozen lockfile. The workflow inventories and tests the unpacked artifact,
normalizes and byte-reproducibility-checks the archive, verifies every packed
path and byte against the audited stage, then publishes checksums, an SBOM, and
provenance alongside the bundle.

## Persistence inventory

The default application directory is `~/.open-state-camping`, overridden by
`OPEN_STATE_HOME`.

| Data | Location | Protection | Removal |
|---|---|---|---|
| Captured session | `session.enc` | Authenticated encryption; file mode 0600 | `disconnect_account` |
| Vault key | Local kit-managed key or `OPEN_STATE_SESSION_KEY` | Device-local secret | Kit-specific removal or environment cleanup |
| Browser authentication state | `browser-profile/` | Dedicated local Chrome profile; directory mode restricted where supported | `disconnect_account` |
| Alerts | `alerts.json` | Local file mode 0600; atomic writes | `delete_alert` or uninstall cleanup |
| Prepared confirmation snapshot | Process memory for one tool call | Structured clone; trusted host elicitation | Acceptance, decline, cancellation, or tool completion |

The application has no hosted database, analytics, telemetry, or maintainer
backend.

## Consequential tool classification

| Tool | Consequence | Required control |
|---|---|---|
| `prepare_booking` | Holds scarce inventory and mutates a cart | Bound preview/confirmation; never pays |
| `update_account` | Changes an official profile | Bound preview showing before/after values |
| `disconnect_account` | Deletes authentication state | Bound preview/confirmation; complete revocation |
| `create_alert` | Persists a search and may send external traffic | Bound preview/confirmation |
| `delete_alert` | Deletes saved citizen data | Bound preview/confirmation |

Read-only tools must remain free of local or upstream mutations except ordinary
HTTP cache behavior outside this application's control. MCP annotations are
descriptive hints, not authorization.

## Threats and required mitigations

### Prompt injection or erroneous tool calls

**Threat:** Model output or upstream content invokes a mutation without informed
consent.

**Mitigation:** Server-enforced trusted host elicitation; strict Zod schemas; no
reliance on model prose, tool descriptions, arguments, or annotations for
authorization.

### Confirmation substitution or model self-approval

**Threat:** The model asserts that the citizen confirmed, changes prepared data,
or attempts to reuse approval for another account.

**Mitigation:** No confirmation input exists in the tool schema. The trusted MCP
host displays the snapshotted preview, the gate defensively clones prepared
data, and the session context is checked before and after citizen review.

### Session disclosure

**Threat:** Cookies enter model-visible diagnostics, error bodies, logs, or
artifacts.

**Mitigation:** Vault encapsulation, explicit auth-header boundary, structured
masking allowlist/denylist tests, no request-header logging, PII and secret scans.

### Incomplete disconnect

**Threat:** The encrypted vault is removed while Chrome retains reusable login
state, or an already-running sign-in restores a session after disconnect.

**Mitigation:** Abort active captures, invalidate all pre-disconnect capture
generations, remove both vault session and the dedicated profile after confirmed
disconnect, and verify reconnect requires visible authentication.

### Malicious or redirected notification target

**Threat:** SSRF, DNS rebinding, open relay, or exfiltration through an alert URL.

**Mitigation:** HTTP(S) only, explicit hostname allowlist, blocked IP literals,
DNS resolution validation at send time, redirect refusal, bounded response and
timeout, and minimal message content.

### Local file corruption or race

**Threat:** A partial write silently erases alerts or exposes permissive files.

**Mitigation:** Atomic temporary-file plus rename, mode 0600, typed visible read
errors, bounded file size, schema validation, and recovery guidance.

### Upstream response manipulation

**Threat:** Parks Canada text or metadata influences model behavior or injects
unsafe URLs.

**Mitigation:** Treat responses as data; normalize fields; keep image fetches on
the exact reservation host; never execute upstream strings; validate all IDs and
URLs.

### Package or release compromise

**Threat:** Mutable dependencies or an arbitrary workflow ref inject code with
access to browser and session state.

**Mitigation:** Exact dependencies with integrity hashes, frozen lockfile,
protected-main ancestry check, protected tag and environment, least-privilege
workflow permissions, esbuild-derived component inventory, final-archive
byte/path comparison, reproducible checksums, SBOM, provenance, and clean-machine
verification.

## Security verification

Release-blocking tests cover:

- absence of any caller-controlled confirmation field;
- decline, cancellation, unsupported-host, mutated-preview, and changed-session behavior;
- zero mutation on every failed confirmation;
- complete disconnect cleanup;
- vault tamper handling and file permissions;
- masked account and booking diagnostics;
- alert corruption, atomic write, and notification retry;
- notification IP, DNS, redirect, and hostname enforcement;
- absence of payment completion paths;
- packaged-file allowlist and secret/PII scan; and
- artifact provenance, checksum, and clean stdio startup.

## Residual risks and assumptions

- A citizen or administrator with access to an unlocked device can access local
  application data. This tool does not replace operating-system account
  security.
- Parks Canada's undocumented APIs can change without notice. Failures must be
  visible and must not trigger guessed writes.
- A local stdio process checks alerts only while its host keeps it running.
- The browser-like User-Agent required by the upstream service remains a
  documented Constitution Article 7.3 tension.
- Price is available only in the cart and is reviewed by the citizen before
  payment.

Security reports follow [`SECURITY.md`](../SECURITY.md). This threat model must
be reviewed whenever a tool, persistent data type, network destination,
authentication mechanism, or release channel changes.
