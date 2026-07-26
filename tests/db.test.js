import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as db from "../lib/db.js";
import { createEmptyCapture } from "../lib/schema.js";

// All tests share one in-memory fake IndexedDB instance for this process
// (matching how a real browser tab has one DB), so tests use unique IDs /
// session dates rather than assuming an empty database.

test("saveAudioBlob + getAudioBlob round-trip", async () => {
  const blob = new Blob(["fake audio bytes"], { type: "audio/webm" });
  const ref = await db.saveAudioBlob(blob);
  const retrieved = await db.getAudioBlob(ref);
  assert.equal(retrieved.size, blob.size);
  assert.equal(retrieved.type, "audio/webm");
});

test("getAudioBlob returns null for an unknown ref", async () => {
  const result = await db.getAudioBlob("does-not-exist");
  assert.equal(result, null);
});

test("putCapture + getCapture round-trip", async () => {
  const capture = createEmptyCapture({ session_date: "2026-07-25", transcript_reviewed: "test dream" });
  await db.putCapture(capture);
  const fetched = await db.getCapture(capture.id);
  assert.equal(fetched.id, capture.id);
  assert.equal(fetched.transcript_reviewed, "test dream");
});

test("deleteCapture removes the capture and its associated audio blob", async () => {
  const blob = new Blob(["bytes"], { type: "audio/webm" });
  const audio_blob_ref = await db.saveAudioBlob(blob);
  const capture = createEmptyCapture({ session_date: "2026-07-25", audio_blob_ref });
  await db.putCapture(capture);

  await db.deleteCapture(capture.id);

  assert.equal(await db.getCapture(capture.id), null);
  assert.equal(await db.getAudioBlob(audio_blob_ref), null);
});

test("markImported adds the app name and sets review_status to imported", async () => {
  const capture = createEmptyCapture({ session_date: "2026-07-25" });
  await db.putCapture(capture);

  await db.markImported(capture.id, "somnia");
  const fetched = await db.getCapture(capture.id);

  assert.deepEqual(fetched.imported_to, ["somnia"]);
  assert.equal(fetched.review_status, "imported");
});

test("markImported doesn't add the same app twice", async () => {
  const capture = createEmptyCapture({ session_date: "2026-07-25" });
  await db.putCapture(capture);

  await db.markImported(capture.id, "somnia");
  await db.markImported(capture.id, "somnia");
  const fetched = await db.getCapture(capture.id);

  assert.deepEqual(fetched.imported_to, ["somnia"]);
});

test("getCapturesGroupedBySession groups by session_date and sorts by sequence", async () => {
  const sessionDate = `test-session-${crypto.randomUUID()}`; // unique per test run, avoids cross-test interference
  const second = createEmptyCapture({ session_date: sessionDate, sequence_in_session: 2 });
  const first = createEmptyCapture({ session_date: sessionDate, sequence_in_session: 1 });
  await db.putCapture(second);
  await db.putCapture(first);

  const groups = await db.getCapturesGroupedBySession();
  const group = groups.get(sessionDate);

  assert.equal(group.length, 2);
  assert.equal(group[0].sequence_in_session, 1);
  assert.equal(group[1].sequence_in_session, 2);
});

test("queuePendingExport + getPendingExports + deletePendingExport round-trip", async () => {
  const entry = await db.queuePendingExport({
    transportId: "relay",
    captureIds: ["a", "b"],
    captures: [{ transcript_reviewed: "x" }],
  });

  const pending = await db.getPendingExports();
  assert.ok(pending.some((p) => p.id === entry.id));

  await db.deletePendingExport(entry.id);
  const afterDelete = await db.getPendingExports();
  assert.ok(!afterDelete.some((p) => p.id === entry.id));
});
