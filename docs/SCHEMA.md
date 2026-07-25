# Echo — Data Schema

## schema_version: 1

## Capture object

| Field                | Type                                                              | Notes |
|----------------------|--------------------------------------------------------------------|-------|
| `id`                 | string (uuid v4)                                                   | unique identifier |
| `schema_version`     | number                                                              | version at time of writing, for future migrations |
| `created_at`         | string (ISO 8601, UTC)                                              | when recording started |
| `updated_at`         | string (ISO 8601, UTC)                                              | last modification |
| `duration_sec`       | number                                                              | recording length |
| `audio_blob_ref`     | string \| null                                                      | key into the local `audio` IndexedDB store, not the audio itself |
| `audio_mime`         | string \| null                                                      | e.g. `"audio/webm"` |
| `transcript_raw`     | string \| null                                                      | unedited automatic transcript |
| `transcript_reviewed`| string \| null                                                      | user-edited transcript |
| `transcript_status`  | `"none" \| "pending" \| "processing" \| "done" \| "failed"`         | transcription state |
| `transcript_engine`  | string \| null                                                      | e.g. `"whisper-tiny-quantized"` |
| `language_hint`      | string \| null                                                      | ISO 639-1 code (`sl`, `en`) if known |
| `review_status`      | `"unreviewed" \| "reviewed" \| "imported"`                          | has the user reviewed / sent this capture |
| `imported_to`        | array<string>                                                       | which destination apps this was sent to, e.g. `["somnia"]` |
| `source_app`         | string                                                              | always `"echo@<version>"` |
| `notes`              | string \| null                                                      | optional free-text note |
| `session_date`       | string (`YYYY-MM-DD`)                                               | which "sleep night" this belongs to — see grouping rule below |
| `sequence_in_session`| number                                                              | order within that night, starting at 1 |
| `continues_previous` | boolean                                                             | true if this is a continuation of the same dream as the prior capture, not a new one |

## Session grouping rule

A capture belongs to the same `session_date` as the previous capture if it was
made within **6 hours** of it. The night label uses the calendar date the
sleep period *started* — a capture made at 2am counts toward the previous
evening's date, so a session doesn't accidentally split across midnight.

`continues_previous` is a separate, narrower signal: it's only set when the
gap since the last capture is short (≤10 minutes) and the user confirms it's
the same dream continuing, not a new one. Consecutive captures with
`continues_previous: true` are meant to be concatenated into a single sleep
cycle's content when exported — see `INTEGRATION.md`.

## Design principles

1. **Audio and transcript are separate from the record itself.** `audio_blob_ref`
   points to a separate IndexedDB object store, so capture metadata stays
   light and fast to list/review without loading audio.
2. **`imported_to` is the only integration state.** Destination apps never
   write back into Echo's storage directly — Echo updates `imported_to`
   itself once a transport reports success.
3. **`schema_version` is per-record, not per-database.** This allows gradual
   migration of older captures without blocking new ones.
4. **Nothing is deleted automatically.** Deletion is always an explicit user
   action — a safeguard against losing a night's capture to a bug.
5. **Nothing leaves the device without an explicit user action.** Recording,
   transcription, and storage are all local. Sending data anywhere (any
   transport) only happens when the user taps to send it.
