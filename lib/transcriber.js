// Echo — local speech-to-text via Transformers.js (Whisper, quantized).
// Model is only fetched on first actual use (lazy load), then cached by the
// browser (Cache Storage) so every later run is fully offline.
//
// Nothing here ever sends audio anywhere — inference runs on-device (WASM,
// or WebGPU if available).

const MODEL_TIER_KEY = "echo.modelTier";
const DEFAULT_TIER = "tiny";

export const MODEL_TIERS = {
  tiny: { modelId: "Xenova/whisper-tiny", labelKey: "settings.model.tiny" },
  base: { modelId: "Xenova/whisper-base", labelKey: "settings.model.base" },
};

export function getModelTier() {
  const stored = localStorage.getItem(MODEL_TIER_KEY);
  return MODEL_TIERS[stored] ? stored : DEFAULT_TIER;
}

export function setModelTier(tier) {
  if (!MODEL_TIERS[tier]) return;
  localStorage.setItem(MODEL_TIER_KEY, tier);
  // A different model needs a different pipeline instance — drop any cached
  // one for the *other* tier's slot isn't necessary (each tier has its own
  // cache entry below), nothing to invalidate here.
}

const pipelinesByTier = {}; // one lazy-loaded pipeline per tier, so switching doesn't refetch
let onProgress = () => {};

export function setProgressHandler(fn) {
  onProgress = fn || (() => {});
}

async function getPipeline(tier) {
  if (!pipelinesByTier[tier]) {
    pipelinesByTier[tier] = (async () => {
      const { pipeline, env } = await import(
        "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2"
      );
      // Keep everything local: don't try remote inference APIs, only the
      // one-time model file download that Transformers.js itself caches.
      env.allowRemoteModels = true;
      env.allowLocalModels = false;

      return pipeline("automatic-speech-recognition", MODEL_TIERS[tier].modelId, {
        quantized: true,
        progress_callback: (data) => onProgress(data),
      });
    })();
  }
  return pipelinesByTier[tier];
}

/**
 * Transcribe an audio Blob fully on-device.
 * @param {Blob} blob
 * @param {string|null} languageHint  ISO 639-1 code ("sl", "en") or null for auto-detect
 * @param {string} [tier]  "tiny" | "base" — defaults to the user's saved preference
 * @returns {Promise<string>}
 */
export async function transcribeBlob(blob, languageHint = null, tier = getModelTier()) {
  const transcriber = await getPipeline(tier);
  const audioData = await decodeAudioToFloat32(blob);
  const result = await transcriber(audioData, {
    language: languageHint || undefined,
    task: "transcribe",
    chunk_length_s: 30,
  });
  return (result?.text || "").trim();
}

async function decodeAudioToFloat32(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: 16000,
  });
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);
  // Whisper expects mono 16kHz Float32.
  const channelData =
    decoded.numberOfChannels > 1
      ? mixDown(decoded)
      : decoded.getChannelData(0);
  await audioCtx.close();
  return channelData;
}

function mixDown(buffer) {
  const length = buffer.length;
  const out = new Float32Array(length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) out[i] += data[i] / buffer.numberOfChannels;
  }
  return out;
}
