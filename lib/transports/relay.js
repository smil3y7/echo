import { defineTransport } from "./transport-interface.js";
import { showPrompt } from "../modal.js";
import { t } from "../../lang/index.js";

const ENDPOINT_KEY = "echo.relay.endpoint";
const SECRET_KEY = "echo.relay.secret";

function getEndpoint() {
  return localStorage.getItem(ENDPOINT_KEY);
}

function setEndpoint(url) {
  localStorage.setItem(ENDPOINT_KEY, url);
}

function getSecret() {
  return localStorage.getItem(SECRET_KEY) || "";
}

function setSecret(secret) {
  if (secret) localStorage.setItem(SECRET_KEY, secret);
  else localStorage.removeItem(SECRET_KEY);
}

export const relayTransport = defineTransport({
  id: "relay",
  nameKey: "transport.relay.name",
  descriptionKey: "transport.relay.description",
  requiresSetup: true,
  // Tells the caller (app.js) it's safe to queue-and-retry a failure whose
  // message is specifically "unreachable" (network absent), rather than
  // treating every failure as final. Auth/rejection failures are NOT queued
  // -- retrying with the same bad secret would just fail again.
  queueableOnFailure: true,

  async isAvailable() {
    return typeof fetch === "function";
  },

  isConfigured() {
    return Boolean(getEndpoint());
  },

  async setup() {
    const currentEndpoint = getEndpoint() || "";
    const url = await showPrompt(t("transport.relay.promptEndpoint"), {
      defaultValue: currentEndpoint,
      placeholder: "http://192.168.1.20:4243",
      okLabel: t("modal.ok"),
      cancelLabel: t("modal.cancel"),
    });
    if (!url) return;
    setEndpoint(url.trim().replace(/\/+$/, ""));

    const currentSecret = getSecret();
    const secret = await showPrompt(t("transport.relay.promptSecret"), {
      defaultValue: currentSecret,
      okLabel: t("modal.ok"),
      cancelLabel: t("modal.cancel"),
    });
    if (secret !== null) setSecret(secret.trim());
  },

  async send(captures) {
    const endpoint = getEndpoint();
    if (!endpoint) {
      return { success: false, message: "error.relayNotConfigured" };
    }
    const secret = getSecret();
    try {
      const res = await fetch(`${endpoint}/captures`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { "X-Echo-Relay-Secret": secret } : {}),
        },
        body: JSON.stringify({ captures }),
      });
      if (res.status === 401 || res.status === 403) {
        return { success: false, message: "error.relayAuthFailed" };
      }
      if (!res.ok) return { success: false, message: "error.relayRejected" };
      return { success: true };
    } catch {
      // fetch throws (rather than resolving with a bad status) specifically
      // when the request never reached a server at all -- DNS failure,
      // connection refused, or no network. That's the "queue and retry
      // later" case; anything the server actually responded to is not.
      return { success: false, message: "error.relayUnreachable" };
    }
  },
});
