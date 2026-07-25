// Echo — pure session/merge logic, kept free of DOM/IndexedDB dependencies
// so it can be unit tested directly (see tests/session.test.js).

/**
 * Concatenate consecutive continues_previous captures into one draft sleep
 * cycle. Input is assumed already sorted by sequence_in_session ascending.
 * Does not mutate the input array or its objects.
 * @param {object[]} captures
 * @returns {object[]}
 */
export function mergeContinuations(captures) {
  const merged = [];
  for (const c of captures) {
    if (c.continues_previous && merged.length) {
      const prev = merged[merged.length - 1];
      prev.transcript_reviewed = `${prev.transcript_reviewed || ""}\n${c.transcript_reviewed || ""}`.trim();
      prev.duration_sec += c.duration_sec;
    } else {
      merged.push({ ...c });
    }
  }
  return merged;
}
