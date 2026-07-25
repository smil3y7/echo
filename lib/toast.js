// Echo — lightweight non-blocking toast, for success feedback that
// shouldn't interrupt the user (unlike lib/modal.js, which blocks until
// dismissed). Used after an export actually succeeds, since transports like
// relay give no other visible feedback (no share sheet, no download prompt).

const root = document.getElementById("toast-root");
let hideTimer = null;

export function showToast(message, duration = 3000) {
  root.textContent = message;
  root.classList.add("visible");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => root.classList.remove("visible"), duration);
}
