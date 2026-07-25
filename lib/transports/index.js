import { webShareTransport } from "./web-share.js";
import { fileExportTransport } from "./file-export.js";
import { relayTransport } from "./relay.js";
import { cloudFolderTransport } from "./cloud-folder.js";

export const ALL_TRANSPORTS = [
  webShareTransport,
  cloudFolderTransport,
  relayTransport,
  fileExportTransport, // always last: universal fallback
];

export async function getAvailableTransports() {
  const results = await Promise.all(
    ALL_TRANSPORTS.map(async (t) => ({ transport: t, available: await t.isAvailable() }))
  );
  return results.filter((r) => r.available).map((r) => r.transport);
}

export function getTransportById(id) {
  return ALL_TRANSPORTS.find((t) => t.id === id) || null;
}
