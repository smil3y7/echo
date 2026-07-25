import { defineTransport } from "./transport-interface.js";

export const fileExportTransport = defineTransport({
  id: "file-export",
  nameKey: "transport.fileExport.name",
  descriptionKey: "transport.fileExport.description",
  requiresSetup: false,
  // A browser download always "succeeds" from the page's point of view even
  // if the user cancels the save dialog — we can't actually confirm delivery.
  confirmRequired: true,

  async isAvailable() {
    return true; // always works, this is the universal fallback
  },

  async send(captures) {
    const json = JSON.stringify({ exported_at: new Date().toISOString(), captures }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `echo-export-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { success: true };
  },
});
