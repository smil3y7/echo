// Echo — pure error-classification helper, kept free of DOM dependencies
// so it's unit-testable (see tests/errors.test.js).

/** @param {Error|DOMException|null|undefined} err */
export function storageErrorKey(err) {
  return err?.name === "QuotaExceededError" ? "error.storageFull" : "error.storageFailed";
}
