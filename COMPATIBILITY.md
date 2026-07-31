# Compatibility

## Requirements

- Node.js 20 or newer for npm installation.
- Google Chrome for `connect_account` and browser checkout.
- An MCP client that supports stdio.
- MCP form elicitation for `prepare_booking`, `update_account`,
  `disconnect_account`, `create_alert`, and `delete_alert`. Unsupported clients
  fail closed; anonymous search and read-only tools remain available.

CI runs the offline test suite, standalone build, package audit, and stdio smoke
test on current GitHub-hosted Ubuntu, macOS, and Windows runners with Node.js 22.

## Host support

| Host/install route | Status |
|---|---|
| Claude Desktop `.mcpb` | Primary packaged route; form elicitation is required for consequential tools |
| Generic MCP client via `npx` | Supported when the client provides stdio and form elicitation |
| Clients without form elicitation | Read-only tools only; consequential actions intentionally refuse to run |

Browser discovery and desktop installation still depend on host and OS policy.
Open an issue with the host version, OS, logs with secrets removed, and exact
failure if the server starts but Chrome or elicitation is unavailable.
