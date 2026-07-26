import { test } from "node:test";
import assert from "node:assert/strict";
import { audioFilename, MIME_EXTENSIONS } from "../lib/audio-filename.js";

test("known mime types map to the expected extension", () => {
  assert.equal(MIME_EXTENSIONS["audio/webm"], "webm");
  assert.equal(MIME_EXTENSIONS["audio/mp4"], "m4a");
  assert.equal(MIME_EXTENSIONS["audio/ogg"], "ogg");
  assert.equal(MIME_EXTENSIONS["audio/mpeg"], "mp3");
  assert.equal(MIME_EXTENSIONS["audio/wav"], "wav");
});

test("builds a filename with the mapped extension", () => {
  const name = audioFilename({ audio_mime: "audio/webm", session_date: "2026-07-25", sequence_in_session: 2 });
  assert.equal(name, "echo_2026-07-25_02.webm");
});

test("strips codec parameters before looking up the extension", () => {
  const name = audioFilename({
    audio_mime: "audio/webm;codecs=opus",
    session_date: "2026-07-25",
    sequence_in_session: 1,
  });
  assert.equal(name, "echo_2026-07-25_01.webm");
});

test("falls back to .webm for an unknown or missing mime type", () => {
  const withUnknown = audioFilename({ audio_mime: "audio/x-mystery", session_date: "2026-07-25", sequence_in_session: 1 });
  assert.equal(withUnknown, "echo_2026-07-25_01.webm");

  const withMissing = audioFilename({ audio_mime: null, session_date: "2026-07-25", sequence_in_session: 1 });
  assert.equal(withMissing, "echo_2026-07-25_01.webm");
});

test("zero-pads the sequence number to two digits", () => {
  const single = audioFilename({ audio_mime: "audio/wav", session_date: "2026-07-25", sequence_in_session: 3 });
  assert.equal(single, "echo_2026-07-25_03.wav");

  const double = audioFilename({ audio_mime: "audio/wav", session_date: "2026-07-25", sequence_in_session: 12 });
  assert.equal(double, "echo_2026-07-25_12.wav");
});
