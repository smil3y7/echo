# Echo — Integration Guide

Echo is fully independent of any destination app. It doesn't know Somnia's
(or anyone else's) internal database schema — it only produces JSON that
follows `SCHEMA.md`. How that JSON gets from Echo to a destination app is
handled by a **transport adapter**; how a destination app maps it into its own
data model is a separate, later step.

## Export payload shape

Whatever transport is used, the payload looks like:

```json
{
  "exported_at": "2026-07-24T05:31:00.000Z",
  "captures": [ /* array of Capture objects, see SCHEMA.md */ ]
}
```

## Transport adapters

All transports implement the same interface (`lib/transports/transport-interface.js`):

```js
{
  id: "web-share",
  nameKey: "transport.webShare.name",
  descriptionKey: "transport.webShare.description",
  requiresSetup: false,
  isAvailable: async () => boolean,
  setup: async () => void,        // only if requiresSetup
  send: async (captures) => { success: boolean, message?: string },
}
```

Shipped transports:

| id             | Mechanism                                              | Requires setup |
|-----------------|---------------------------------------------------------|-----------------|
| `web-share`      | `navigator.share()` with a file — AirDrop / Nearby Share | no |
| `cloud-folder`   | File System Access API, write into a synced folder       | yes (pick folder once) |
| `relay`          | POST to a local server on the home network                | yes (enter endpoint) |
| `file-export`    | Plain file download — universal fallback                  | no |

Adding a new transport means adding one file that satisfies this shape and
registering it in `lib/transports/index.js`. Nothing else in Echo needs to
change.

### `relay` protocol

`POST {endpoint}/captures` with body `{ "captures": [...] }`, same shape as
the export payload minus `exported_at`. Expects a 2xx response.

If a secret is configured in Echo's settings, it's sent as the
`X-Echo-Relay-Secret` header on every request. A relay server implementation
should compare this against its own configured secret and respond `401` or
`403` if it doesn't match — Echo treats those two status codes specifically
as an auth failure (distinct from "server unreachable", which is queued for
automatic retry; see below). If no secret is set, the header is omitted —
this is meant for a trusted home network only, not a substitute for real
authentication if the relay is ever exposed beyond that.

### Retry queue

If a relay `send()` fails because the server was unreachable entirely (no
response — network absent, DNS failure, connection refused), the export is
queued in Echo's local `pending_exports` store instead of being discarded.
Echo retries all queued exports automatically on next app launch and
whenever the browser's `online` event fires; the person can also trigger a
retry manually from Settings. A rejected request (bad secret, malformed
payload, 4xx/5xx from a server that *did* respond) is not queued, since
retrying an unchanged payload against the same server would just fail again
the same way.

## Reading Echo data from a destination app (e.g. Somnia)

However the JSON arrives (via relay endpoint, a shared/synced folder, or a
manually-received file), the destination app:

1. Parses the payload and groups `captures` by `session_date`.
2. Within a session, merges consecutive captures where
   `continues_previous: true` into a single sleep cycle's content
   (concatenate `transcript_reviewed`, sum `duration_sec`).
3. Builds one draft "dream" entry per session:

```json
{
  "title": "",
  "date": "<session_date>",
  "location": "",
  "sleep_cycles": [
    { "wake_time": "<HH:MM from created_at>", "content": "<transcript_reviewed>" }
  ]
}
```

`title`, `date` (editable), and `location` are left for the user to fill in —
Echo only ever pre-fills `wake_time` and `content`. Everything else about how
this draft becomes a real Somnia record (exact field names, DB writes, UI) is
destination-app-specific and out of scope for Echo itself.

4. Once imported, the destination app doesn't need to write anything back
   into Echo — the transport marks the source captures as `imported_to`
   itself, on the Echo side, once `send()` reports success.
