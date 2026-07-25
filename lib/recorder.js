// Echo — audio recording wrapper around MediaRecorder

export class Recorder {
  constructor() {
    this.mediaRecorder = null;
    this.chunks = [];
    this.stream = null;
    this.startedAt = null;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickSupportedMimeType();
    this.mediaRecorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.startedAt = Date.now();
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();
  }

  isRecording() {
    return this.mediaRecorder?.state === "recording";
  }

  /** @returns {Promise<{blob: Blob, mime: string, durationSec: number}>} */
  async stop() {
    if (!this.mediaRecorder) throw new Error("Recorder was not started");
    const mime = this.mediaRecorder.mimeType;
    const durationSec = (Date.now() - this.startedAt) / 1000;
    await new Promise((resolve) => {
      this.mediaRecorder.onstop = resolve;
      this.mediaRecorder.stop();
    });
    this.stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(this.chunks, { type: mime });
    return { blob, mime, durationSec };
  }
}

function pickSupportedMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  if (typeof MediaRecorder === "undefined") return null;
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) || null;
}
