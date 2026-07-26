import { test } from "node:test";
import assert from "node:assert/strict";
import { storageErrorKey } from "../lib/errors.js";

test("QuotaExceededError maps to the storage-full message", () => {
  const err = new DOMException("no space", "QuotaExceededError");
  assert.equal(storageErrorKey(err), "error.storageFull");
});

test("any other error maps to the generic storage-failed message", () => {
  assert.equal(storageErrorKey(new Error("boom")), "error.storageFailed");
  assert.equal(storageErrorKey(new DOMException("x", "NotFoundError")), "error.storageFailed");
});

test("missing/undefined error still maps to the generic message, doesn't throw", () => {
  assert.equal(storageErrorKey(undefined), "error.storageFailed");
  assert.equal(storageErrorKey(null), "error.storageFailed");
});
