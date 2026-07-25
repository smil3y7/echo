import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeContinuations } from "../lib/session.js";

function capture(overrides) {
  return {
    id: Math.random().toString(36).slice(2),
    transcript_reviewed: "",
    duration_sec: 10,
    continues_previous: false,
    ...overrides,
  };
}

test("captures with no continuations stay separate", () => {
  const input = [capture({ transcript_reviewed: "a" }), capture({ transcript_reviewed: "b" })];
  const result = mergeContinuations(input);
  assert.equal(result.length, 2);
});

test("a continuation is concatenated into the previous capture's content", () => {
  const input = [
    capture({ transcript_reviewed: "first part", duration_sec: 10 }),
    capture({ transcript_reviewed: "second part", duration_sec: 5, continues_previous: true }),
  ];
  const result = mergeContinuations(input);
  assert.equal(result.length, 1);
  assert.equal(result[0].transcript_reviewed, "first part\nsecond part");
  assert.equal(result[0].duration_sec, 15);
});

test("multiple consecutive continuations all merge into one", () => {
  const input = [
    capture({ transcript_reviewed: "a", duration_sec: 10 }),
    capture({ transcript_reviewed: "b", duration_sec: 5, continues_previous: true }),
    capture({ transcript_reviewed: "c", duration_sec: 5, continues_previous: true }),
  ];
  const result = mergeContinuations(input);
  assert.equal(result.length, 1);
  assert.equal(result[0].transcript_reviewed, "a\nb\nc");
  assert.equal(result[0].duration_sec, 20);
});

test("a continuation as the very first capture in the list is kept as-is (no prior to merge into)", () => {
  const input = [capture({ transcript_reviewed: "orphan continuation", continues_previous: true })];
  const result = mergeContinuations(input);
  assert.equal(result.length, 1);
  assert.equal(result[0].transcript_reviewed, "orphan continuation");
});

test("does not mutate the original input array's objects", () => {
  const original = capture({ transcript_reviewed: "a", duration_sec: 10 });
  const input = [original, capture({ transcript_reviewed: "b", duration_sec: 5, continues_previous: true })];
  mergeContinuations(input);
  assert.equal(original.transcript_reviewed, "a"); // unchanged
});

test("a new dream after a continuation starts a fresh group", () => {
  const input = [
    capture({ transcript_reviewed: "a" }),
    capture({ transcript_reviewed: "b", continues_previous: true }),
    capture({ transcript_reviewed: "c", continues_previous: false }),
  ];
  const result = mergeContinuations(input);
  assert.equal(result.length, 2);
  assert.equal(result[0].transcript_reviewed, "a\nb");
  assert.equal(result[1].transcript_reviewed, "c");
});
