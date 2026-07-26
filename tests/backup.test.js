import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as db from "../lib/db.js";
import { createEmptyCapture } from "../lib/schema.js";
import { createBackup, restoreBackup, BACKUP_VERSION } from "../lib/backup.js";

test("createBackup includes all captures and embeds audio as base64", async () => {
  const sessionDate = `backup-test-${crypto.randomUUID()}`;
  const blob = new Blob(["fake audio bytes"], { type: "audio/webm" });
  const audio_blob_ref = await db.saveAudioBlob(blob);
  const withAudio = createEmptyCapture({ session_date: sessionDate, audio_blob_ref, audio_mime: "audio/webm" });
  const withoutAudio = createEmptyCapture({ session_date: sessionDate, transcript_reviewed: "no audio here" });
  await db.putCapture(withAudio);
  await db.putCapture(withoutAudio);

  const backup = await createBackup();

  assert.equal(backup.backup_version, BACKUP_VERSION);
  assert.ok(Array.isArray(backup.captures));

  const found = backup.captures.find((c) => c.id === withAudio.id);
  assert.ok(found.audio_base64.length > 0);
  assert.equal(found.audio_blob_ref, undefined); // internal ref stripped, meaningless elsewhere

  const foundNoAudio = backup.captures.find((c) => c.id === withoutAudio.id);
  assert.equal(foundNoAudio.audio_base64, undefined);
  assert.equal(foundNoAudio.transcript_reviewed, "no audio here");
});

test("restoreBackup reconstructs captures and their audio blobs", async () => {
  const sessionDate = `restore-test-${crypto.randomUUID()}`;
  const blob = new Blob(["roundtrip me"], { type: "audio/webm" });
  const audio_blob_ref = await db.saveAudioBlob(blob);
  const original = createEmptyCapture({ session_date: sessionDate, audio_blob_ref, audio_mime: "audio/webm" });
  await db.putCapture(original);

  const backup = await createBackup();
  // Simulate restoring onto a fresh device: delete only the one this test
  // created. Other captures already in the shared fake-IndexedDB instance
  // (from earlier tests in this file) are still present and will correctly
  // be skipped as "already exists" — that's the non-destructive behavior
  // under test elsewhere, not something to fight here.
  await db.deleteCapture(original.id);

  const result = await restoreBackup(backup);
  assert.equal(result.restored, 1); // only the one capture we actually deleted
  assert.equal(result.failed, 0);

  const restoredCapture = await db.getCapture(original.id);
  assert.ok(restoredCapture);
  assert.ok(restoredCapture.audio_blob_ref); // got a new ref assigned on restore

  const restoredBlob = await db.getAudioBlob(restoredCapture.audio_blob_ref);
  const text = await restoredBlob.text();
  assert.equal(text, "roundtrip me");
});

test("restoreBackup skips captures that already exist locally (non-destructive)", async () => {
  const sessionDate = `skip-test-${crypto.randomUUID()}`;
  const capture = createEmptyCapture({ session_date: sessionDate, transcript_reviewed: "original text" });
  await db.putCapture(capture);

  const backup = {
    backup_version: BACKUP_VERSION,
    captures: [{ ...capture, transcript_reviewed: "a different device's edit" }],
  };
  const result = await restoreBackup(backup);

  assert.equal(result.skipped, 1);
  assert.equal(result.restored, 0);

  const stillOriginal = await db.getCapture(capture.id);
  assert.equal(stillOriginal.transcript_reviewed, "original text"); // not overwritten
});

test("restoreBackup rejects a payload without a captures array", async () => {
  await assert.rejects(() => restoreBackup({ not_a_backup: true }));
});

test("restoreBackup accepts a JSON string, not just a parsed object", async () => {
  const sessionDate = `string-test-${crypto.randomUUID()}`;
  const capture = createEmptyCapture({ session_date: sessionDate });
  const backup = { backup_version: BACKUP_VERSION, captures: [capture] };

  const result = await restoreBackup(JSON.stringify(backup));
  assert.equal(result.restored, 1);
});
