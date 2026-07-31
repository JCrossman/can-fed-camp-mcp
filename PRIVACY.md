# Privacy

Open State: Camping runs locally. The project operator does not run a proxy,
analytics service, account system, or telemetry endpoint and does not receive
your searches, session, alerts, or booking activity.

## Data flows

| Activity | Data sent | Recipient |
|---|---|---|
| Search and availability | Parks, dates, party size, equipment and accessibility filters | `reservation.pc.gc.ca` |
| Account connection | Sign-in details entered directly in Chrome; the server captures only resulting session cookies | Parks Canada and the citizen's device |
| Booking preparation | Selected inventory, dates, party details, and encrypted-session cookies | Parks Canada |
| Notifications | A short availability message and the random topic URL | `ntfy.sh`, a configured ntfy server, or an explicitly allow-listed host |

The MCP host and model receive tool arguments and results, such as requested
dates and availability. They do not receive stored session cookies, encryption
keys, browser profile data, or payment details. Do not put sensitive information
in search or alert text.

## Data stored on the device

The default directory is `~/.open-state-camping`, or `OPEN_STATE_HOME` when set.
It may contain:

- an AES-256-GCM encrypted Parks Canada cookie session and encryption key file
  (mode `0600` on POSIX systems; Windows uses the account's filesystem ACLs),
  unless `OPEN_STATE_SESSION_KEY` supplies the key;
- `browser-profile/`, a dedicated Chrome profile used for citizen-driven sign-in
  and checkout;
- `alerts.json`, containing alert criteria, status, retry information, and an
  optional notification URL. It is mode `0600` on POSIX systems and governed by
  the user's filesystem ACLs on Windows. It contains no Parks Canada password.

The random suffix of an automatic ntfy topic acts as a bearer secret. Anyone
with that URL may subscribe, so keep it private. Notification delivery is
subject to the selected service's privacy policy.

## Retention and deletion

`disconnect_account` requires direct citizen approval and removes both the
encrypted session and dedicated Chrome profile. Alerts remain until individually
deleted. To remove everything, stop the MCP server and delete
`~/.open-state-camping` (or the configured `OPEN_STATE_HOME`). Uninstalling the
npm package or `.mcpb` does not automatically remove this data.

Parks Canada, your MCP host/model provider, npm, GitHub, and notification
providers maintain their own logs and retention policies. This project cannot
delete data held by those third parties.
