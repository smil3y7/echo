import { defineTransport } from "./transport-interface.js";
import { saveHandle, loadHandle } from "../db.js";

// The FileSystemDirectoryHandle itself is persisted in IndexedDB (handles are
// structured-cloneable), so the folder only has to be picked once. What the
// browser does NOT persist automatically is the *permission* to use it — that
// has to be re-verified (and sometimes re-requested, which needs a user
// gesture) each session. We keep a lightweight in-memory cache on top of the
// persisted handle just to avoid re-reading IndexedDB on every send().
const HANDLE_KEY = "cloud-folder-dir";
let memoryHandle = null;

async function getPersistedHandle() {
  if (memoryHandle) return memoryHandle;
  memoryHandle = await loadHandle(HANDLE_KEY);
  return memoryHandle;
}

/** @returns {Promise<"granted"|"prompt"|"denied"|"missing">} */
async function checkPermission(handle) {
  if (!handle) return "missing";
  return handle.queryPermission({ mode: "readwrite" });
}

export const cloudFolderTransport = defineTransport({
  id: "cloud-folder",
  nameKey: "transport.cloudFolder.name",
  descriptionKey: "transport.cloudFolder.description",
  requiresSetup: true,

  async isAvailable() {
    return "showDirectoryPicker" in window;
  },

  /** True once a folder has been picked before, even if permission needs re-confirming. */
  async isConfigured() {
    return Boolean(await getPersistedHandle());
  },

  async setup() {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    await saveHandle(HANDLE_KEY, handle);
    memoryHandle = handle;
  },

  async send(captures) {
    const handle = await getPersistedHandle();
    if (!handle) {
      return { success: false, message: "error.cloudFolderNotConfigured" };
    }

    let permission = await checkPermission(handle);
    if (permission === "prompt") {
      // Requires a user gesture — send() is only ever called from a click
      // handler, so this is still within that gesture's activation window.
      try {
        permission = await handle.requestPermission({ mode: "readwrite" });
      } catch {
        permission = "denied";
      }
    }
    if (permission !== "granted") {
      return { success: false, message: "error.cloudFolderPermissionDenied" };
    }

    try {
      const filename = `echo-export-${Date.now()}.json`;
      const fileHandle = await handle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify({ exported_at: new Date().toISOString(), captures }, null, 2));
      await writable.close();
      return { success: true };
    } catch {
      return { success: false, message: "error.cloudFolderWriteFailed" };
    }
  },
});
