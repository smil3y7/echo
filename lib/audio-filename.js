// Echo — pure filename/extension logic for downloaded audio, kept free of
// DOM dependencies so it's unit-testable (see tests/audio-filename.test.js).

export const MIME_EXTENSIONS = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

/**
 * @param {{audio_mime?: string|null, session_date: string, sequence_in_session: number}} capture
 * @returns {string} e.g. "echo_2026-07-25_02.webm"
 */
export function audioFilename(capture) {
  const baseMime = (capture.audio_mime || "").split(";")[0].trim();
  const ext = MIME_EXTENSIONS[baseMime] || "webm";
  const seq = String(capture.sequence_in_session).padStart(2, "0");
  return `echo_${capture.session_date}_${seq}.${ext}`;
}
