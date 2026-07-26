import { t, applyTranslations, loadLanguage, detectPreferredLanguage, setPreferredLanguage, LANGUAGES, currentLanguage } from "../lang/index.js";
import { Recorder } from "./recorder.js";
import { transcribeBlob, setProgressHandler, getModelTier, setModelTier, MODEL_TIERS } from "./transcriber.js";
import { createEmptyCapture, assignSession } from "./schema.js";
import * as db from "./db.js";
import { getAvailableTransports, getTransportById } from "./transports/index.js";
import { mergeContinuations } from "./session.js";
import { showAlert, showConfirm } from "./modal.js";
import { showToast } from "./toast.js";

const recorder = new Recorder();
let audioCtx, analyser, rafId;
let pendingSessionChoice = null; // resolved by the continuation prompt
let activeObjectUrls = []; // audio <source> URLs from the current review render, revoked on next render

const $ = (sel) => document.querySelector(sel);
const views = { record: $("#view-record"), review: $("#view-review"), settings: $("#view-settings") };
const recordBtn = $("#record-btn");
const recordStatus = $("#record-status");
const rings = $("#rings");
const sessionPrompt = $("#session-prompt");

async function init() {
  await loadLanguage(detectPreferredLanguage());
  applyTranslations();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  wireNav();
  wireRecordButton();
  await renderSettings();
  await renderReview();
  flushPendingExports(); // in case some were queued from a previous session
  window.addEventListener("online", flushPendingExports);
}

function wireNav() {
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
}

function switchView(name) {
  for (const key of Object.keys(views)) {
    views[key].classList.toggle("active", key === name);
  }
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === name);
  });
  if (name === "review") renderReview();
}

// ---------- Recording ----------

function wireRecordButton() {
  recordBtn.addEventListener("click", async () => {
    if (recorder.isRecording()) {
      await stopAndProcess();
    } else {
      await startRecording();
    }
  });
}

async function startRecording() {
  try {
    await recorder.start();
  } catch {
    recordStatus.textContent = t("error.micDenied");
    return;
  }
  recordBtn.classList.add("recording");
  recordStatus.textContent = t("record.recording");
  startRingAnimation(recorder.stream);
}

async function stopAndProcess() {
  stopRingAnimation();
  recordBtn.classList.remove("recording");
  recordBtn.disabled = true;
  const { blob, mime, durationSec } = await recorder.stop();

  const previous = await db.getLatestCapture();
  const now = new Date();
  const session = assignSession(now, previous);

  let continuesPrevious = false;
  const gapMinutes = previous ? (now - new Date(previous.created_at)) / 60000 : Infinity;
  if (previous && gapMinutes <= 10) {
    continuesPrevious = await askContinuation();
  }

  recordStatus.textContent = t("record.loadingModel");
  setProgressHandler((data) => {
    if (data?.status === "progress" && typeof data.progress === "number") {
      recordStatus.textContent = `${t("record.loadingModel")} ${Math.round(data.progress)}%`;
    } else if (data?.status === "done") {
      recordStatus.textContent = t("record.processing");
    }
  });

  let audio_blob_ref;
  try {
    audio_blob_ref = await db.saveAudioBlob(blob);
  } catch (err) {
    recordBtn.disabled = false;
    recordStatus.textContent = t(storageErrorKey(err));
    return; // nothing was written yet, safe to just stop here
  }

  let transcript_raw = null;
  let transcript_status = "processing";
  const tier = getModelTier();
  try {
    transcript_raw = await transcribeBlob(blob, currentLanguage(), tier);
    transcript_status = "done";
  } catch {
    transcript_status = "failed";
  }

  const capture = createEmptyCapture({
    duration_sec: durationSec,
    audio_blob_ref,
    audio_mime: mime,
    transcript_raw,
    transcript_reviewed: transcript_raw,
    transcript_status,
    transcript_engine: `whisper-${tier}-quantized`,
    language_hint: currentLanguage(),
    session_date: session.session_date,
    sequence_in_session: session.sequence_in_session,
    continues_previous: continuesPrevious,
  });

  try {
    await db.putCapture(capture);
  } catch (err) {
    // Don't leave an orphaned audio blob with no capture record pointing to it.
    await db.deleteAudioBlob(audio_blob_ref).catch(() => {});
    recordBtn.disabled = false;
    recordStatus.textContent = t(storageErrorKey(err));
    return;
  }

  recordBtn.disabled = false;
  recordStatus.textContent = t("record.savedToast");
  setTimeout(() => (recordStatus.textContent = ""), 2000);
}

function storageErrorKey(err) {
  return err?.name === "QuotaExceededError" ? "error.storageFull" : "error.storageFailed";
}

function askContinuation() {
  return new Promise((resolve) => {
    sessionPrompt.classList.add("visible");
    sessionPrompt.querySelector("[data-choice='continue']").onclick = () => {
      sessionPrompt.classList.remove("visible");
      resolve(true);
    };
    sessionPrompt.querySelector("[data-choice='new']").onclick = () => {
      sessionPrompt.classList.remove("visible");
      resolve(false);
    };
  });
}

function startRingAnimation(stream) {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);

  const tick = () => {
    analyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const scale = 1 + avg / 90;
    rings.style.setProperty("--amp", scale.toFixed(2));
    rafId = requestAnimationFrame(tick);
  };
  tick();
}

function stopRingAnimation() {
  if (rafId) cancelAnimationFrame(rafId);
  rings.style.setProperty("--amp", "1");
  audioCtx?.close();
}

// ---------- Review ----------

async function renderReview() {
  const container = $("#review-list");
  const groups = await db.getCapturesGroupedBySession();

  // Revoke object URLs from the previous render before building new ones,
  // so repeated review visits don't leak memory.
  activeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  activeObjectUrls = [];
  container.innerHTML = "";

  if (groups.size === 0) {
    container.innerHTML = `<p class="empty">${t("review.empty")}</p>`;
    return;
  }

  for (const [sessionDate, captures] of [...groups.entries()].reverse()) {
    const section = document.createElement("section");
    section.className = "session-group";
    section.innerHTML = `
      <div class="session-header">
        <h3>${t("review.night")} — ${sessionDate}</h3>
        <button class="export-btn" data-session="${sessionDate}">${t("review.exportSession")}</button>
      </div>
    `;
    for (const capture of captures) {
      section.appendChild(await renderCaptureCard(capture));
    }
    container.appendChild(section);
  }

  container.querySelectorAll(".export-btn").forEach((btn) => {
    btn.addEventListener("click", () => exportSession(btn.dataset.session));
  });
}

async function renderCaptureCard(capture) {
  const card = document.createElement("div");
  card.className = "capture-card";
  const wakeTime = new Date(capture.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  let audioUrl = null;
  let audioBlob = null;
  if (capture.audio_blob_ref) {
    try {
      audioBlob = await db.getAudioBlob(capture.audio_blob_ref);
      if (audioBlob) {
        audioUrl = URL.createObjectURL(audioBlob);
        activeObjectUrls.push(audioUrl);
      }
    } catch {
      // Missing/corrupt audio blob shouldn't block reviewing the transcript.
    }
  }

  card.innerHTML = `
    <div class="capture-meta">
      <span class="wake-time">${wakeTime}</span>
      ${capture.continues_previous ? `<span class="badge">${t("record.continuesPrevious")}</span>` : ""}
      <span class="status status-${capture.review_status}">${capture.review_status}</span>
    </div>
    ${audioUrl ? `
    <div class="audio-player" data-audio-player>
      <audio preload="metadata" src="${audioUrl}"></audio>
      <button type="button" class="audio-play-btn" data-action="toggle-play" aria-label="${t("review.play")}">
        <svg class="icon-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
        <svg class="icon-pause" viewBox="0 0 24 24" hidden><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>
      </button>
      <input type="range" class="audio-seek" min="0" max="0" value="0" step="0.1">
      <span class="audio-time">0:00</span>
      <button type="button" class="audio-download-btn" data-action="download-audio" aria-label="${t("review.downloadAudio")}" title="${t("review.downloadAudio")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16"/></svg>
      </button>
    </div>
    ` : ""}
    <textarea class="transcript-edit">${capture.transcript_reviewed || ""}</textarea>
    <div class="capture-actions">
      <button data-action="review">${capture.review_status === "reviewed" ? t("review.markUnreviewed") : t("review.markReviewed")}</button>
      <button data-action="delete" class="danger">${t("review.delete")}</button>
    </div>
  `;
  const textarea = card.querySelector("textarea");
  textarea.addEventListener("change", async () => {
    capture.transcript_reviewed = textarea.value;
    await db.putCapture(capture);
  });
  if (audioUrl) wireAudioPlayer(card);
  if (audioBlob) {
    card.querySelector("[data-action='download-audio']")?.addEventListener("click", () => {
      downloadBlob(audioBlob, audioFilename(capture));
    });
  }
  card.querySelector("[data-action='review']").addEventListener("click", async () => {
    capture.review_status = capture.review_status === "reviewed" ? "unreviewed" : "reviewed";
    await db.putCapture(capture);
    renderReview();
  });
  card.querySelector("[data-action='delete']").addEventListener("click", async () => {
    const proceed = await showConfirm(t("review.confirmDelete"), {
      confirmLabel: t("modal.delete"),
      cancelLabel: t("modal.cancel"),
    });
    if (!proceed) return;
    await db.deleteCapture(capture.id);
    renderReview();
  });
  return card;
}

/** Triggers a browser download of an in-memory Blob under the given filename. */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const MIME_EXTENSIONS = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

function audioFilename(capture) {
  const baseMime = (capture.audio_mime || "").split(";")[0].trim();
  const ext = MIME_EXTENSIONS[baseMime] || "webm";
  const seq = String(capture.sequence_in_session).padStart(2, "0");
  return `echo_${capture.session_date}_${seq}.${ext}`;
}

/**
 * Wires up a minimal custom audio player (play/pause, seek, time) built on
 * a bare <audio> element with no `controls` attribute — the browser's
 * native controls come with a context menu ("More options", "Download",
 * "Playback speed", etc.) rendered in the browser's own language, which
 * can't be translated from the page. Building our own UI is the only way
 * every visible label here goes through Echo's i18n system.
 */
function wireAudioPlayer(card) {
  const container = card.querySelector("[data-audio-player]");
  const audio = container.querySelector("audio");
  const playBtn = container.querySelector("[data-action='toggle-play']");
  const iconPlay = playBtn.querySelector(".icon-play");
  const iconPause = playBtn.querySelector(".icon-pause");
  const seek = container.querySelector(".audio-seek");
  const timeLabel = container.querySelector(".audio-time");

  const formatTime = (seconds) => {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const setPlayingIcon = (isPlaying) => {
    iconPlay.hidden = isPlaying;
    iconPause.hidden = !isPlaying;
    playBtn.setAttribute("aria-label", t(isPlaying ? "review.pause" : "review.play"));
  };

  audio.addEventListener("loadedmetadata", () => {
    seek.max = audio.duration || 0;
    timeLabel.textContent = formatTime(audio.duration);
  });
  audio.addEventListener("timeupdate", () => {
    seek.value = audio.currentTime;
    timeLabel.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
  });
  audio.addEventListener("ended", () => setPlayingIcon(false));
  // The browser attaches its own right-click context menu ("More options",
  // "Save audio as", etc.) to *any* <audio> element regardless of the
  // `controls` attribute — that menu is rendered in the browser/OS's own
  // language, not the page's, so it can't be translated. Hiding the element
  // (see CSS) already keeps it out of normal reach; this is a defense-in-
  // depth block in case a browser still allows reaching it some other way.
  audio.addEventListener("contextmenu", (e) => e.preventDefault());

  playBtn.addEventListener("click", () => {
    if (audio.paused) {
      audio.play();
      setPlayingIcon(true);
    } else {
      audio.pause();
      setPlayingIcon(false);
    }
  });
  seek.addEventListener("input", () => {
    audio.currentTime = parseFloat(seek.value);
  });
}

async function exportSession(sessionDate) {
  const groups = await db.getCapturesGroupedBySession();
  const captures = groups.get(sessionDate) || [];

  const alreadySentSome = captures.some((c) => c.imported_to.length > 0);
  if (alreadySentSome) {
    const proceed = await showConfirm(t("review.confirmDuplicateExport"), {
      confirmLabel: t("modal.send"),
      cancelLabel: t("modal.cancel"),
    });
    if (!proceed) return;
  }

  const merged = mergeContinuations(captures);
  const transportId = localStorage.getItem("echo.activeTransport") || "file-export";
  const transport = getTransportById(transportId);
  const result = await transport.send(merged);

  if (!result.success) {
    if (transport.queueableOnFailure && result.message === "error.relayUnreachable") {
      await db.queuePendingExport({
        transportId,
        captureIds: captures.map((c) => c.id),
        captures: merged,
      });
      await showAlert(t("review.queuedForRetry"));
      renderSettings(); // updates the queued-exports count
      return;
    }
    await showAlert(t(result.message || "error.shareFailed"));
    return;
  }

  if (transport.confirmRequired) {
    const confirmed = await showConfirm(t("review.confirmDelivery"), {
      confirmLabel: t("modal.yes"),
      cancelLabel: t("modal.no"),
    });
    if (!confirmed) return; // leave review_status untouched — nothing marked imported
  }

  for (const c of captures) await db.markImported(c.id, "somnia");
  renderReview();
  showToast(t("review.exportSuccess"));
}

/**
 * Retry any exports that previously failed because the relay was
 * unreachable. Called on app init and whenever the browser regains
 * connectivity. Silently leaves an entry queued if it still fails —
 * this is meant to run unattended, not surface errors on every retry.
 */
async function flushPendingExports() {
  const pending = await db.getPendingExports();
  if (!pending.length) return;

  let sentCount = 0;
  for (const entry of pending) {
    const transport = getTransportById(entry.transportId);
    if (!transport) {
      await db.deletePendingExport(entry.id); // transport no longer exists, nothing to retry
      continue;
    }
    const result = await transport.send(entry.captures);
    if (result.success) {
      for (const id of entry.captureIds) await db.markImported(id, "somnia");
      await db.deletePendingExport(entry.id);
      sentCount++;
    }
    // On continued failure, leave it queued for the next trigger.
  }
  if (sentCount > 0) {
    showToast(t("review.queuedExportsSent").replace("{n}", sentCount));
  }
  renderReview();
  renderSettings();
}

/** @see lib/session.js for the pure merge logic (kept there so it's unit-testable). */

// ---------- Settings ----------

async function renderSettings() {
  const langSelect = $("#lang-select");
  langSelect.innerHTML = Object.entries(LANGUAGES)
    .map(([code, meta]) => `<option value="${code}">${meta.name}</option>`)
    .join("");
  langSelect.value = currentLanguage();
  langSelect.addEventListener("change", async () => {
    setPreferredLanguage(langSelect.value);
    await loadLanguage(langSelect.value);
    applyTranslations();
    renderReview();
  });

  const modelSelect = $("#model-select");
  modelSelect.innerHTML = Object.entries(MODEL_TIERS)
    .map(([tier, meta]) => `<option value="${tier}">${t(`${meta.labelKey}.name`)} — ${t(`${meta.labelKey}.description`)}</option>`)
    .join("");
  modelSelect.value = getModelTier();
  modelSelect.addEventListener("change", () => setModelTier(modelSelect.value));

  const transportList = $("#transport-list");
  const available = await getAvailableTransports();
  const active = localStorage.getItem("echo.activeTransport") || available[0]?.id;
  const rows = await Promise.all(
    available.map(async (tr) => ({
      tr,
      configured: tr.requiresSetup ? Boolean(await tr.isConfigured?.()) : true,
    }))
  );
  transportList.innerHTML = rows
    .map(
      ({ tr, configured }) => `
      <label class="transport-option">
        <input type="radio" name="transport" value="${tr.id}" ${tr.id === active ? "checked" : ""}>
        <div>
          <strong>${t(tr.nameKey)}</strong>
          <p>${t(tr.descriptionKey)}</p>
          ${tr.requiresSetup ? `<span class="config-status ${configured ? "ok" : "pending"}">${configured ? t("settings.configured") : t("settings.notConfigured")}</span>` : ""}
        </div>
        ${tr.requiresSetup ? `<button data-setup="${tr.id}">${t("settings.configure")}</button>` : ""}
      </label>
    `
    )
    .join("");

  transportList.querySelectorAll("input[name='transport']").forEach((input) => {
    input.addEventListener("change", () => localStorage.setItem("echo.activeTransport", input.value));
  });
  transportList.querySelectorAll("[data-setup]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tr = getTransportById(btn.dataset.setup);
      await tr.setup?.();
      renderSettings();
    });
  });

  const pending = await db.getPendingExports();
  const pendingBlock = $("#pending-exports-block");
  if (pending.length === 0) {
    pendingBlock.style.display = "none";
  } else {
    pendingBlock.style.display = "";
    $("#pending-exports-count").textContent = t("settings.pendingExportsCount").replace("{n}", pending.length);
  }
  $("#retry-exports-btn").onclick = () => flushPendingExports();
}

init();
