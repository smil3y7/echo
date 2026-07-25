import { defineTransport } from "./transport-interface.js";

function buildExportFile(captures) {
  const json = JSON.stringify({ exported_at: new Date().toISOString(), captures }, null, 2);
  return new File([json], `echo-export-${Date.now()}.json`, { type: "application/json" });
}

export const webShareTransport = defineTransport({
  id: "web-share",
  nameKey: "transport.webShare.name",
  descriptionKey: "transport.webShare.description",
  requiresSetup: false,

  async isAvailable() {
    if (!navigator.share || !navigator.canShare) return false;
    // Feature-detect file sharing support specifically.
    try {
      const testFile = new File(["test"], "test.json", { type: "application/json" });
      return navigator.canShare({ files: [testFile] });
    } catch {
      return false;
    }
  },

  async send(captures) {
    const file = buildExportFile(captures);
    if (!navigator.canShare({ files: [file] })) {
      return { success: false, message: "error.shareFilesUnsupported" };
    }
    try {
      await navigator.share({
        files: [file],
        title: "Echo — sanjski zapisi",
      });
      return { success: true };
    } catch (err) {
      if (err?.name === "AbortError") {
        return { success: false, message: "error.shareCancelled" };
      }
      return { success: false, message: "error.shareFailed" };
    }
  },
});
