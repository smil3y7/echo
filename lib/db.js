// Echo — IndexedDB storage layer
// Two object stores: 'captures' (metadata + transcript) and 'audio' (blobs),
// kept separate so listing/reviewing captures never has to load audio data.

const DB_NAME = "echo-db";
const DB_VERSION = 3;
const STORE_CAPTURES = "captures";
const STORE_AUDIO = "audio";
const STORE_HANDLES = "handles"; // persisted FileSystemHandle objects (e.g. cloud-folder)
const STORE_PENDING_EXPORTS = "pending_exports"; // queued sends waiting for network

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CAPTURES)) {
        const store = db.createObjectStore(STORE_CAPTURES, { keyPath: "id" });
        store.createIndex("session_date", "session_date");
        store.createIndex("review_status", "review_status");
        store.createIndex("created_at", "created_at");
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, { keyPath: "ref" });
      }
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_PENDING_EXPORTS)) {
        db.createObjectStore(STORE_PENDING_EXPORTS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Persist a FileSystemHandle (e.g. a chosen directory) under a fixed key. */
export async function saveHandle(key, handle) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const t = tx(db, [STORE_HANDLES], "readwrite");
    t.objectStore(STORE_HANDLES).put({ key, handle });
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}

export async function loadHandle(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = tx(db, [STORE_HANDLES], "readonly");
    const req = t.objectStore(STORE_HANDLES).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.handle : null);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, storeNames, mode) {
  return db.transaction(storeNames, mode);
}

export async function saveAudioBlob(blob) {
  const db = await openDb();
  const ref = crypto.randomUUID();
  await new Promise((resolve, reject) => {
    const t = tx(db, [STORE_AUDIO], "readwrite");
    t.objectStore(STORE_AUDIO).put({ ref, blob });
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  return ref;
}

export async function getAudioBlob(ref) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = tx(db, [STORE_AUDIO], "readonly");
    const req = t.objectStore(STORE_AUDIO).get(ref);
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAudioBlob(ref) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = tx(db, [STORE_AUDIO], "readwrite");
    t.objectStore(STORE_AUDIO).delete(ref);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}

export async function putCapture(capture) {
  const db = await openDb();
  capture.updated_at = new Date().toISOString();
  await new Promise((resolve, reject) => {
    const t = tx(db, [STORE_CAPTURES], "readwrite");
    t.objectStore(STORE_CAPTURES).put(capture);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  return capture;
}

export async function getCapture(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = tx(db, [STORE_CAPTURES], "readonly");
    const req = t.objectStore(STORE_CAPTURES).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteCapture(id) {
  const existing = await getCapture(id);
  if (existing?.audio_blob_ref) {
    await deleteAudioBlob(existing.audio_blob_ref);
  }
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const t = tx(db, [STORE_CAPTURES], "readwrite");
    t.objectStore(STORE_CAPTURES).delete(id);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}

export async function getAllCaptures() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = tx(db, [STORE_CAPTURES], "readonly");
    const req = t.objectStore(STORE_CAPTURES).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.created_at.localeCompare(b.created_at)));
    req.onerror = () => reject(req.error);
  });
}

export async function getLatestCapture() {
  const all = await getAllCaptures();
  return all.length ? all[all.length - 1] : null;
}

export async function getPendingCaptures({ status = "unreviewed" } = {}) {
  const all = await getAllCaptures();
  return all.filter((c) => c.review_status === status);
}

export async function getCapturesGroupedBySession() {
  const all = await getAllCaptures();
  const groups = new Map();
  for (const c of all) {
    if (!groups.has(c.session_date)) groups.set(c.session_date, []);
    groups.get(c.session_date).push(c);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.sequence_in_session - b.sequence_in_session);
  }
  return groups;
}

export async function markImported(id, appName) {
  const capture = await getCapture(id);
  if (!capture) return null;
  if (!capture.imported_to.includes(appName)) {
    capture.imported_to.push(appName);
  }
  capture.review_status = "imported";
  return putCapture(capture);
}

// ---------- Pending exports queue (for transports that can fail due to
// no network, like relay, and should retry automatically later) ----------

export async function queuePendingExport({ transportId, captureIds, captures }) {
  const db = await openDb();
  const entry = {
    id: crypto.randomUUID(),
    transportId,
    captureIds,
    captures,
    queued_at: new Date().toISOString(),
  };
  await new Promise((resolve, reject) => {
    const t = tx(db, [STORE_PENDING_EXPORTS], "readwrite");
    t.objectStore(STORE_PENDING_EXPORTS).put(entry);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  return entry;
}

export async function getPendingExports() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = tx(db, [STORE_PENDING_EXPORTS], "readonly");
    const req = t.objectStore(STORE_PENDING_EXPORTS).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deletePendingExport(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const t = tx(db, [STORE_PENDING_EXPORTS], "readwrite");
    t.objectStore(STORE_PENDING_EXPORTS).delete(id);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}
