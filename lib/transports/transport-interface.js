// Echo — Transport Adapter interface
//
// Every transport (how captures get from this phone to Somnia / another app)
// implements this same shape. Echo's core logic never knows which one is
// active — it just calls send(). Add a new transport by creating a new file
// that satisfies this shape and registering it in transports/index.js.

/**
 * @typedef {Object} TransportResult
 * @property {boolean} success
 * @property {string} [message]
 */

/**
 * @typedef {Object} Transport
 * @property {string} id                 stable id, e.g. "web-share"
 * @property {string} nameKey            i18n key for display name
 * @property {string} descriptionKey      i18n key for description
 * @property {boolean} requiresSetup
 * @property {boolean} [confirmRequired]  true if send() can't actually verify
 *           delivery (e.g. a browser download that might get cancelled) —
 *           the caller should ask the user to confirm before marking
 *           captures as imported.
 * @property {() => Promise<boolean>} isAvailable
 * @property {() => Promise<void>} [setup]
 * @property {(captures: object[]) => Promise<TransportResult>} send
 */

export function defineTransport(transport) {
  // Thin helper mainly for documentation/consistency; validates required fields.
  const required = ["id", "nameKey", "isAvailable", "send"];
  for (const field of required) {
    if (!(field in transport)) {
      throw new Error(`Transport is missing required field: ${field}`);
    }
  }
  return transport;
}
