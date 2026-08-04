# @open-state/camping

Local MCP server for finding and preparing Parks Canada reservations. Searches
are anonymous. Account sessions stay encrypted on the citizen's device, and
consequential actions require direct approval through the MCP host before the
server proceeds. Payment is always completed by the citizen in their browser.

```bash
npx --yes @open-state/camping@1.0.6
```

Requires Node.js 20 or newer, Google Chrome for account and booking flows, and an
MCP host with form elicitation for consequential tools. See the
[project documentation](https://github.com/JCrossman/can-fed-camp-mcp#readme),
[privacy notice](https://github.com/JCrossman/can-fed-camp-mcp/blob/main/PRIVACY.md),
and [security policy](https://github.com/JCrossman/can-fed-camp-mcp/blob/main/SECURITY.md).

MIT licensed. This independent project is not affiliated with Parks Canada or
the Government of Canada.
