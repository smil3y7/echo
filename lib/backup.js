// Echo — full-database backup/restore. Separate from the per-night export
// transports (relay/share/cloud-folder/file-export), which only ever send
// one night's transcripts and metadata to Somnia. This is a standalone
// safety net: everything in IndexedDB — every capture regardless of
// review_status, plus its audio — in one file, meant to survive clearing
// browser data, reinstalling the PWA, or switching phones.
//
// Audio is embedded as base64 rather than written as separate files or a
// zip, to avoid adding a dependency for something that only needs to run
// occasionally. This costs ~33% size overhead on the audio and holds
// everything in memory as one JSON string while building the file — fine at
// the personal scale this was built for (recordings are short voice memos,
// dozens to a few hundred over months). If the archive grows large enough
// for that to become a real problem, revisit with a streaming/zip approach
// rather than assuming it's needed now.

import * as db from "./db.js";
import { APP_VERSION } from "./schema.js";

export const BACKUP_VERSION = 1;

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBlob(base64, mime) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime || "audio/webm" });
}

/**
 * Builds the full backup payload (all captures + their audio as base64).
 * Does not write a file itself — caller decides how to save/download it.
 */
export async function createBackup() {
  const captures = await db.getAllCaptures();
  const enriched = [];
  for (const capture of captures) {
    const copy = { ...capture };
    if (capture.audio_blob_ref) {
      try {
        const blob = await db.getAudioBlob(capture.audio_blob_ref);
        if (blob) copy.audio_base64 = await blobToBase64(blob);
      } catch {
        // Missing/corrupt audio shouldn't fail the whole backup — the
        // capture's transcript and metadata are still worth preserving.
      }
    }
    delete copy.audio_blob_ref; // internal IndexedDB key, meaningless on another device
    enriched.push(copy);
  }
  return {
    backup_version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
    app_version: APP_VERSION,
    capture_count: enriched.length,
    captures: enriched,
  };
}

/**
 * Restores captures from a backup payload. Non-destructive by design: any
 * capture whose id already exists locally is skipped rather than
 * overwritten, so restoring is safe to run more than once (e.g. after
 * merging backups from two devices) without clobbering local edits.
 * @returns {Promise<{restored: number, skipped: number, failed: number, total: number}>}
 */
export async function restoreBackup(payload) {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (!parsed || !Array.isArray(parsed.captures)) {
    throw new Error("Invalid backup file: missing captures array");
  }

  let restored = 0;
  let skipped = 0;
  let failed = 0;

  for (const raw of parsed.captures) {
    try {
      const existing = await db.getCapture(raw.id);
      if (existing) {
        skipped++;
        continue;
      }
      const capture = { ...raw };
      if (capture.audio_base64) {
        const blob = base64ToBlob(capture.audio_base64, capture.audio_mime);
        capture.audio_blob_ref = await db.saveAudioBlob(blob);
      } else {
        capture.audio_blob_ref = null;
      }
      delete capture.audio_base64;
      await db.putCapture(capture);
      restored++;
    } catch {
      failed++;
    }
  }

  return { restored, skipped, failed, total: parsed.captures.length };
}
