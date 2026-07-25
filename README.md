# Echo

Catch the dream before it fades.

Echo is a standalone, offline-first PWA for capturing dreams by voice right
after waking up — before the memory fades. It records audio, transcribes it
fully on-device (no cloud, no API calls), and lets you review and lightly
edit the transcript before sending it on to a dream journal app like Somnia.

## Why it's built this way

- **Nothing leaves the device without an explicit action.** Recording,
  storage, and transcription are all local. Sending data anywhere only
  happens when you choose a transport and tap send.
- **No forced infrastructure.** You pick a transport in Settings: share via
  AirDrop/Nearby Share, a synced cloud folder you already use, a local relay
  server on your home network (if you have one), or just a file download.
- **Independent of any destination app.** Echo only knows its own schema
  (`docs/SCHEMA.md`). How another app maps that into its own database is a
  separate, later integration step (`docs/INTEGRATION.md`).

## Running it

Serve the folder over HTTP (needed for the service worker and ES modules —
`file://` won't work for those):

```bash
npx serve .
# or: python3 -m http.server 8080
```

Then open it on your phone (same WiFi, use your computer's local IP) and
"Add to Home Screen" for the full PWA experience.

The first recording triggers a one-time download of the local transcription
model (~tens of MB); after that it's fully offline.

## Tests

```bash
node --test
```

No dependencies, no build step — just Node's built-in test runner against
the pure logic in `lib/schema.js` and `lib/session.js`. The `package.json`
in this repo exists only to mark the project as ES modules for Node; it's
not used to run the app itself.

## Project layout

```
echo/
├── index.html                 # UI shell
├── manifest.json, sw.js        # PWA
├── lang/                       # i18n (sl, en) — see lang/index.js to add a language
├── lib/
│   ├── app.js                   # UI wiring
│   ├── db.js                    # IndexedDB storage
│   ├── recorder.js              # MediaRecorder wrapper
│   ├── schema.js                 # data shape + session grouping
│   ├── transcriber.js            # local Whisper via Transformers.js
│   └── transports/               # pluggable send mechanisms
└── docs/
    ├── SCHEMA.md
    ├── INTEGRATION.md
    └── CHANGELOG.md
```

## Status

v0.1.0 — MVP. See `docs/CHANGELOG.md` for what's covered and what's not yet.
