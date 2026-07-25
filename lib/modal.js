// Echo — reusable modal dialogs (alert / confirm / prompt), replacing the
// browser's native window.alert/confirm/prompt so the UI stays consistent
// with the rest of the app instead of dropping into an OS-styled popup.
// Pure UI component: no i18n or app logic here, callers pass already-
// translated strings.

const root = document.getElementById("modal-root");

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function render(bodyHtml, buttonsHtml) {
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-box" role="dialog" aria-modal="true">
        <div class="modal-message">${bodyHtml}</div>
        <div class="modal-actions">${buttonsHtml}</div>
      </div>
    </div>
  `;
  root.classList.add("visible");
}

function close() {
  root.classList.remove("visible");
  root.innerHTML = "";
}

/** @returns {Promise<void>} */
export function showAlert(message, okLabel = "OK") {
  return new Promise((resolve) => {
    render(
      escapeHtml(message),
      `<button class="modal-btn primary" data-action="ok">${escapeHtml(okLabel)}</button>`
    );
    const finish = () => {
      close();
      document.removeEventListener("keydown", onKey);
      resolve();
    };
    const onKey = (e) => {
      if (e.key === "Enter" || e.key === "Escape") finish();
    };
    root.querySelector("[data-action='ok']").addEventListener("click", finish);
    document.addEventListener("keydown", onKey);
    root.querySelector("[data-action='ok']").focus();
  });
}

/** @returns {Promise<boolean>} */
export function showConfirm(message, { confirmLabel = "OK", cancelLabel = "Cancel" } = {}) {
  return new Promise((resolve) => {
    render(
      escapeHtml(message),
      `<button class="modal-btn" data-action="cancel">${escapeHtml(cancelLabel)}</button>
       <button class="modal-btn primary" data-action="confirm">${escapeHtml(confirmLabel)}</button>`
    );
    const finish = (value) => {
      close();
      document.removeEventListener("keydown", onKey);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === "Escape") finish(false);
      if (e.key === "Enter") finish(true);
    };
    root.querySelector("[data-action='confirm']").addEventListener("click", () => finish(true));
    root.querySelector("[data-action='cancel']").addEventListener("click", () => finish(false));
    document.addEventListener("keydown", onKey);
    root.querySelector("[data-action='confirm']").focus();
  });
}

/** @returns {Promise<string|null>} null if cancelled */
export function showPrompt(message, { defaultValue = "", placeholder = "", okLabel = "OK", cancelLabel = "Cancel" } = {}) {
  return new Promise((resolve) => {
    render(
      `${escapeHtml(message)}<input type="text" class="modal-input" value="${escapeHtml(defaultValue)}" placeholder="${escapeHtml(placeholder)}">`,
      `<button class="modal-btn" data-action="cancel">${escapeHtml(cancelLabel)}</button>
       <button class="modal-btn primary" data-action="ok">${escapeHtml(okLabel)}</button>`
    );
    const input = root.querySelector(".modal-input");
    const finish = (value) => {
      close();
      document.removeEventListener("keydown", onKey);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === "Enter") finish(input.value);
      if (e.key === "Escape") finish(null);
    };
    root.querySelector("[data-action='ok']").addEventListener("click", () => finish(input.value));
    root.querySelector("[data-action='cancel']").addEventListener("click", () => finish(null));
    input.addEventListener("keydown", onKey);
    input.focus();
    input.select();
  });
}
