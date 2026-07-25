import { test } from "node:test";
import assert from "node:assert/strict";
import { assignSession } from "../lib/schema.js";

test("first capture ever starts session #1", () => {
  const now = new Date("2026-07-24T22:00:00");
  const result = assignSession(now, null);
  assert.equal(result.sequence_in_session, 1);
  assert.equal(result.session_date, "2026-07-24");
});

test("second capture within 6h stays in the same session, sequence increments", () => {
  const previous = { session_date: "2026-07-24", sequence_in_session: 1, created_at: "2026-07-24T23:00:00" };
  const now = new Date("2026-07-25T02:30:00"); // 3.5h later
  const result = assignSession(now, previous);
  assert.equal(result.session_date, "2026-07-24");
  assert.equal(result.sequence_in_session, 2);
});

test("capture after a large gap (>6h) starts a new session", () => {
  const previous = { session_date: "2026-07-24", sequence_in_session: 2, created_at: "2026-07-25T02:00:00" };
  const now = new Date("2026-07-25T14:00:00"); // 12h later, e.g. an afternoon nap
  const result = assignSession(now, previous);
  assert.notEqual(result.session_date, previous.session_date);
  assert.equal(result.sequence_in_session, 1);
});

test("a post-midnight capture rolls back to the previous evening's date", () => {
  // No previous capture at all — this is the "first capture of the night,
  // but it happens to be 2am" case, which should still count as the
  // *previous* calendar day's sleep session, not a new one.
  const now = new Date("2026-07-25T02:15:00");
  const result = assignSession(now, null);
  assert.equal(result.session_date, "2026-07-24");
});

test("a capture made in the afternoon is NOT rolled back a day", () => {
  const now = new Date("2026-07-24T15:00:00");
  const result = assignSession(now, null);
  assert.equal(result.session_date, "2026-07-24");
});

test("exactly at the 6h boundary still counts as same session", () => {
  const previous = { session_date: "2026-07-24", sequence_in_session: 1, created_at: "2026-07-24T22:00:00" };
  const now = new Date("2026-07-25T04:00:00"); // exactly 6h later
  const result = assignSession(now, previous);
  assert.equal(result.session_date, "2026-07-24");
  assert.equal(result.sequence_in_session, 2);
});
