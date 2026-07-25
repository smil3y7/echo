// Echo — Data schema definitions
// See docs/SCHEMA.md for the human-readable spec.

export const SCHEMA_VERSION = 1;
export const SOURCE_APP = "echo";
export const APP_VERSION = "0.2.2";

/**
 * @typedef {Object} Capture
 * @property {string} id
 * @property {number} schema_version
 * @property {string} created_at        ISO 8601 UTC
 * @property {string} updated_at        ISO 8601 UTC
 * @property {number} duration_sec
 * @property {string|null} audio_blob_ref   key into the 'audio' object store
 * @property {string|null} audio_mime
 * @property {string|null} transcript_raw
 * @property {string|null} transcript_reviewed
 * @property {"none"|"pending"|"processing"|"done"|"failed"} transcript_status
 * @property {string|null} transcript_engine
 * @property {string|null} language_hint
 * @property {"unreviewed"|"reviewed"|"imported"} review_status
 * @property {string[]} imported_to
 * @property {string} source_app
 * @property {string|null} notes
 * @property {string} session_date         "YYYY-MM-DD", the "sleep night" this capture belongs to
 * @property {number} sequence_in_session
 * @property {boolean} continues_previous  true if this is a continuation of the prior capture's dream
 */

export function createEmptyCapture(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    schema_version: SCHEMA_VERSION,
    created_at: now,
    updated_at: now,
    duration_sec: 0,
    audio_blob_ref: null,
    audio_mime: null,
    transcript_raw: null,
    transcript_reviewed: null,
    transcript_status: "none",
    transcript_engine: null,
    language_hint: null,
    review_status: "unreviewed",
    imported_to: [],
    source_app: `${SOURCE_APP}@${APP_VERSION}`,
    notes: null,
    session_date: null,
    sequence_in_session: 1,
    continues_previous: false,
    ...overrides,
  };
}

/**
 * Given a timestamp and the most recent prior capture (if any),
 * decide which "sleep night" this capture belongs to and its sequence number.
 * A new capture within NIGHT_GAP_HOURS of the previous one is treated as the
 * same session; the "night" label uses the date the sleep period started
 * (so a 2am capture after an 11pm one still belongs to the earlier calendar date).
 */
const NIGHT_GAP_HOURS = 6;

export function assignSession(newCaptureDate, previousCapture) {
  if (!previousCapture) {
    return { session_date: toNightDate(newCaptureDate), sequence_in_session: 1 };
  }
  const prevDate = new Date(previousCapture.created_at);
  const gapHours = (newCaptureDate - prevDate) / 36e5;
  if (gapHours >= 0 && gapHours <= NIGHT_GAP_HOURS) {
    return {
      session_date: previousCapture.session_date,
      sequence_in_session: previousCapture.sequence_in_session + 1,
    };
  }
  return { session_date: toNightDate(newCaptureDate), sequence_in_session: 1 };
}

function toNightDate(d) {
  // If it's between midnight and noon, count it as belonging to the previous
  // calendar day's "night" (typical sleep session spans midnight).
  const local = new Date(d);
  if (local.getHours() < 12) {
    local.setDate(local.getDate() - 1);
  }
  return local.toISOString().slice(0, 10);
}
