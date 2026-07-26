# Changelog

All notable changes to Echo are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.0] — 2026-07-26

### Added
- **Full-database backup/restore** (`lib/backup.js`, new Settings section).
  Separate from the per-night export transports (relay/share/cloud-
  folder/file-export), which only ever send one night's transcripts to
  Somnia — this is a standalone safety net covering *every* capture
  regardless of `review_status`, with audio embedded as base64 in a single
  downloadable JSON file. Restore is non-destructive: any capture whose
  `id` already exists locally is skipped rather than overwritten, so it's
  safe to restore more than once (e.g. merging backups from two devices)
  without clobbering local edits. Restore summarizes
  restored/skipped/failed counts.
- 5 new tests (`tests/backup.test.js`) covering backup content (audio
  embedded correctly, captures without audio handled), restore
  reconstruction (blob round-trips byte-for-byte), the non-destructive
  skip behavior, and rejecting a malformed backup file. Suite is now 33
  tests (was 28).

### Changed
- **Audio is no longer fetched from IndexedDB when Review renders.**
  Previously, every capture's audio blob was read and decoded into an
  object URL eagerly for every card shown, regardless of whether it was
  ever played. This doesn't scale once there are months of nights in the
  database — reviewing today's capture shouldn't require re-reading audio
  for every night ever recorded. The blob is now fetched lazily, once, on
  first play or download click, and cached in memory for the rest of the
  session. Metadata (transcript, times, status) still loads immediately as
  before.
- `lib/backup.js`'s base64 conversion uses `Blob.arrayBuffer()` instead of
  `FileReader`, specifically so it works in Node for testing, not just in
  a browser.

### Known limitations (updated)
- Backup embeds audio as base64 in one JSON file/string, held fully in
  memory while building it — reasonable at the personal scale this was
  built for (dozens to a few hundred short recordings over months), but
  would need a streaming/zip approach if the archive grows large enough
  for that to matter. Not addressed now since there's no evidence yet that
  it will.
- Long-term scale beyond "lazy-load audio" (this release) — e.g. paginating
  Review to avoid loading every capture's metadata at once, or collapsing
  fully-imported nights to reduce DOM work — intentionally deferred until
  actual usage shows it's needed, rather than guessing at a growth curve.

## [0.3.2] — 2026-07-26

### Fixed
- **Version text in Settings was hidden behind the bottom tab bar** on some
  devices — almost certainly `100dvh` not accounting perfectly for mobile
  browsers' address bar showing/hiding. Added extra bottom padding
  specifically to the Review and Settings views (not Record, which
  vertically centers its ring animation and would have looked visibly
  off-center with the same padding applied uniformly).

## [0.3.1] — 2026-07-26

### Added
- **Test coverage for `lib/db.js`**, using `fake-indexeddb` (new
  devDependency — only needed to run `node --test`, not to run the app
  itself in a browser): capture/audio-blob CRUD, delete cleanup,
  `markImported` idempotency, session grouping, and the pending-exports
  queue. 16 new tests total (9 for `db.js`, 5 for the newly-extracted
  `lib/audio-filename.js`, 3 for `lib/errors.js`), bringing the suite to 28.
- **`lib/audio-filename.js` and `lib/errors.js`** — pulled the mime→extension
  mapping/filename logic and the storage-error classification out of
  `lib/app.js` (which can't be imported directly in Node/tests, since it
  touches the DOM at module load) into their own dependency-free modules,
  same pattern as `lib/session.js`.
- **CI** — `.github/workflows/test.yml` runs `npm install && npm test` on
  every push/PR.
- **App version shown in Settings**, small and unobtrusive at the bottom of
  the screen, pulled from `schema.js`'s `APP_VERSION` rather than hardcoded
  in the HTML so it can't silently drift out of sync with a release.

### Known limitations (updated)
- Test coverage still doesn't reach the transport adapters (`relay.js`,
  `web-share.js`, `cloud-folder.js`, `file-export.js`), `lib/modal.js`, or
  the audio player wiring in `lib/app.js` — these stay DOM/fetch-coupled in
  a way that would need `jsdom` or a headless-browser setup (Playwright) to
  test properly, which felt like a bigger step to take without being asked.

## [0.3.0] — 2026-07-25

### Added
- **Download audio recordings.** Each capture card in Review now has a
  small download button next to the play control, saving the raw
  recording to the device as a file (extension inferred from
  `audio_mime`: `.webm`, `.m4a`, `.ogg`, `.mp3`, or `.wav`, defaulting to
  `.webm`). Filenames follow `echo_<session_date>_<sequence>.<ext>`, e.g.
  `echo_2026-07-25_02.webm`. This is a plain browser download of the
  already-fetched audio blob — no new transport, no change to what's sent
  via relay/share/cloud-folder (those still only carry transcripts and
  metadata per `SCHEMA.md`; audio itself was assumed to be a "save it out
  of the app if you want it" action rather than something Somnia needs to
  receive automatically). If it turns out Somnia should actually receive
  the audio too, that's a bigger follow-up — say so and it can be scoped
  separately.

## [0.2.4] — 2026-07-25

### Fixed
- **Native context menu still reachable on the custom audio player.**
  Removing the `controls` attribute (0.2.3) only removes the native
  controls *toolbar* — Chrome and other browsers still attach a right-click
  context menu ("More options", "Save audio as", etc.) to any `<audio>`
  element regardless of `controls`, rendered in the browser/OS's own
  language rather than the page's, which is why it kept appearing (in
  Slovenian) even after the custom player was built. The underlying
  `<audio>` element is now hidden (`display: none` — playback via JS is
  unaffected) so there's nothing left to right-click, plus a
  `contextmenu` listener that blocks it outright as a fallback.
- **Player wasn't visually matching the transcript box.** Set explicit
  `width: 100%` on `.audio-player` and swapped its background from the
  lighter `--bg-elevated-2` (same tone as the textarea, which made the two
  stacked boxes compete/stand out too much against the card) to the
  darker `--bg` with a subtle 1px border, so it recedes rather than pops.
  Increased the gap before the transcript box from 8px to 14px.

## [0.2.3] — 2026-07-25

### Fixed
- **Favicon 404** — added `<link rel="icon">`/`apple-touch-icon` tags.
- **Audio review player showed untranslatable native browser UI.** The
  native `<audio controls>` context menu ("More options", "Download",
  "Playback speed", etc.) is rendered by the browser itself in the
  browser's own language — it was never a hardcoded string in Echo and
  can't be translated via the page. Replaced it with a small custom player
  (play/pause button, seek bar, elapsed/total time) built on a bare
  `<audio>` element with no native controls at all, so every visible label
  goes through `lang/sl.json` / `lang/en.json` like the rest of the app.
- **Favicon redesigned for small sizes.** The main app icon's thin
  concentric rings disappear at 16×16. Added a simplified favicon (one bold
  ring + solid center dot) as `favicon.ico` (16/32/48) and `favicon-32.png`;
  the original detailed icon is kept for the larger PWA/home-screen icon
  where it still reads clearly.

### Known limitations (updated)
- Documented that the relay-over-HTTP-from-HTTPS setup currently works via
  browser leniency (Chrome warns but doesn't yet block Private Network
  Access requests) rather than a real guarantee — see `docs/CHANGELOG.md`
  known limitations below for the follow-up plan (`mkcert`) if/when it
  breaks.

## [0.2.2] — 2026-07-25

### Fixed
- **Deleting a capture no longer happens without confirmation.** Now asks
  via the modal component first — this was a real gap, since it's the one
  destructive, unrecoverable action in the app.
- **Exporting is no longer silent.** Previously, a successful export (most
  notably via relay, which has no share-sheet or download-dialog feedback
  of its own) gave the user no visible sign anything happened. A toast
  (`lib/toast.js`, non-blocking, auto-dismisses) now confirms success after
  every manual export, and after any queued relay export that succeeds
  automatically in the background.

### Added
- **"Mark unreviewed" toggle.** The single "Mark reviewed" button is now a
  toggle that flips back and forth based on current `review_status`, so a
  capture reviewed by mistake (or one the user wants to revisit) isn't
  stuck. Doesn't affect `imported_to` — duplicate-export detection still
  works correctly regardless of review-status changes after the fact.

## [0.2.1] — 2026-07-25

### Changed
- **Replaced all native browser dialogs** (`window.alert`/`confirm`/`prompt`)
  with a custom modal component (`lib/modal.js`) styled to match the rest of
  the app, instead of dropping into an OS-styled popup. Affects the
  duplicate-export warning, delivery confirmation, relay-queued notice,
  generic error alerts, and relay endpoint/secret setup. Supports
  Enter-to-confirm and Escape-to-cancel.
- `echo-relay/README.md`: added Windows `cmd.exe` and PowerShell-specific
  commands for setting the secret (the original Unix-style
  `VAR=value command` syntax doesn't work in either), and a batch-file
  wrapper for the Task Scheduler autostart instructions, since Task
  Scheduler can't set an environment variable on the action directly.

## [0.2.0] — 2026-07-25

### Added
- **Model tier selection (tiny/base).** New Settings option to switch the
  transcription model between `whisper-tiny` (~75MB, fast, less accurate)
  and `whisper-base` (~140MB, slower, more accurate). Each tier's pipeline
  is lazy-loaded and cached independently, so switching back and forth
  doesn't force a re-download. Captures now record which tier produced
  their transcript (`transcript_engine: "whisper-<tier>-quantized"`).
- **Audio playback in review.** Each capture card now has a native audio
  player alongside the editable transcript, so a bad transcript can be
  checked against the actual recording instead of edited blind. Object URLs
  are revoked on every re-render to avoid leaking memory over a long review
  session.
- **Duplicate-export warning.** Exporting a night that already has captures
  with a non-empty `imported_to` now asks for confirmation first, instead of
  silently re-sending.
- **Relay authentication.** An optional shared secret (set alongside the
  endpoint in Settings) is sent as `X-Echo-Relay-Secret`; a `401`/`403`
  response is surfaced as a distinct auth-failure message rather than a
  generic rejection. See `docs/INTEGRATION.md` for the expected server-side
  contract.
- **Relay retry queue.** A relay send that fails because the server was
  unreachable (not rejected — genuinely unreachable) is queued in a new
  `pending_exports` IndexedDB store instead of just failing. Queued exports
  retry automatically on app launch and on the browser's `online` event;
  Settings shows a count and a manual "Retry now" button. Auth/rejection
  failures are deliberately NOT queued, since retrying unchanged against the
  same server would just fail the same way again.

### Changed
- `lib/db.js` bumped to schema v3 (adds `pending_exports` object store,
  additive/idempotent — existing installs upgrade automatically).

## [0.1.3] — 2026-07-25

### Fixed
- **`file-export` no longer silently marks captures as "imported."** A
  browser download can't actually be verified from the page (the user might
  cancel the save dialog), so this and any future transport where delivery
  can't be confirmed now sets `confirmRequired: true`; the UI asks "did this
  actually save?" before touching `review_status`/`imported_to`. Web Share,
  relay, and cloud-folder are unaffected — they already report real
  success/failure.
- **IndexedDB write failures during recording no longer fail silently.**
  `saveAudioBlob`/`putCapture` errors are now caught, shown to the user with
  a specific message for storage-full (`QuotaExceededError`) vs. other
  failures, and the record button re-enables instead of getting stuck
  disabled. If the capture record fails to save *after* the audio blob
  already did, the orphaned blob is cleaned up rather than left dangling.

### Added
- Unit tests (`tests/`, run via `node --test`, no dependencies) covering
  `assignSession` (night-boundary grouping, the 6h gap rule, midnight
  rollover) and `mergeContinuations` (concatenation, mutation safety, mixed
  continuation/new-dream sequences). A minimal `package.json` (`type:
  module`, one `test` script, zero dependencies) was added only so Node can
  resolve the ES module syntax already used throughout `lib/` — it's not a
  build step and isn't needed to run the app itself.
- `lib/session.js` — `mergeContinuations` moved out of `lib/app.js` into its
  own dependency-free module so it's actually testable without a DOM.

## [0.1.2] — 2026-07-25

### Fixed
- **Relay transport never appeared in Settings.** `isAvailable()` incorrectly
  checked whether the relay endpoint was already configured, so it could
  never be reached to configure in the first place. It now just checks
  whether the mechanism (fetch) is usable; a separate `isConfigured()` drives
  a "Configured" / "Not configured" status badge next to each transport that
  needs setup, so it's clear from the Settings screen whether relay or
  cloud-folder actually has something to send to yet.
- Bottom tab bar had near-zero visual weight (plain text, no background, no
  icons). Tabs now have icons, a filled pill background on the active tab,
  and higher color contrast.

### Added
- App icons (192/512, plus a maskable 512 variant) so "Add to Home Screen"
  shows a real icon instead of a blank/generic one.

## [0.1.1] — 2026-07-24

### Fixed
- `cloud-folder` transport now persists the chosen directory handle in
  IndexedDB (`lib/db.js`, new `handles` store) instead of only in memory, so
  the folder no longer has to be re-selected after every app restart.
  Permission (`queryPermission`/`requestPermission`) is still re-verified
  each session, since browsers don't persist that part automatically — this
  now happens transparently on `send()` within the triggering click's user
  gesture, only falling back to a visible error if permission was actually
  revoked.

## [0.1.0] — 2026-07-24

### Added
- Initial MVP: record → local on-device transcription (Transformers.js,
  quantized Whisper-tiny, lazy-loaded) → review → export.
- IndexedDB storage (`captures` + `audio` object stores), nothing leaves the
  device without an explicit export action.
- Session/night grouping (`session_date`, `sequence_in_session`) and
  same-dream continuation handling (`continues_previous`).
- Transport adapter architecture with four adapters: Web Share (AirDrop /
  Nearby Share), synced folder (File System Access API), local relay
  (home-network HTTP endpoint), and universal file-export fallback.
- Slovenian and English UI (`lang/sl.json`, `lang/en.json`), extensible via
  `lang/index.js` registry.
- PWA shell (manifest + service worker) for offline app-shell caching.
- `SCHEMA.md`, `INTEGRATION.md` documentation.

### Known limitations
- **Relay over HTTP from an HTTPS-hosted Echo (e.g. Vercel) relies on
  browser leniency that isn't guaranteed to last.** Chrome currently only
  *warns* in the console about this (Private Network Access enforcement is
  being rolled out gradually) rather than blocking it, so it works today —
  but a future browser update could turn that into an outright block with
  no change needed on Echo's side. If/when that happens, the real fix is
  giving the relay server a locally-trusted HTTPS certificate (e.g. via
  `mkcert`) instead of plain HTTP, which was deliberately not built yet
  since the current setup works and mkcert requires installing a root
  certificate on the phone.
- Relay's rate limiting (added in echo-relay, see its own README) is a flat
  per-IP window, not adaptive — fine for a single personal relay, would want
  revisiting before wider distribution.
- Transcription runs on WASM only; Transformers.js also supports WebGPU
  acceleration on newer devices, which would be noticeably faster, but
  isn't wired up yet.
- No `schema_version` migration logic exists yet — there's only been one
  schema version so far, so this is unwritten until there's an actual v2 to
  migrate from.
- No tests yet for `lib/db.js` or the transport adapters (would need a
  fake-IndexedDB / fetch-mocking setup); current coverage is limited to the
  dependency-free logic in `lib/schema.js` and `lib/session.js`.
