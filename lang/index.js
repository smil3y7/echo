// Echo — i18n registry.
// Adding a language: 1) create lang/<code>.json  2) add one line below.

export const LANGUAGES = {
  sl: { name: "Slovenščina", file: "sl.json" },
  en: { name: "English", file: "en.json" },
};

export const FALLBACK_LANG = "en";
const cache = {};
let current = { code: FALLBACK_LANG, dict: {} };

export async function loadLanguage(code) {
  if (!LANGUAGES[code]) code = FALLBACK_LANG;
  if (!cache[code]) {
    const res = await fetch(`./lang/${LANGUAGES[code].file}`);
    cache[code] = await res.json();
  }
  if (!cache[FALLBACK_LANG] && code !== FALLBACK_LANG) {
    const res = await fetch(`./lang/${LANGUAGES[FALLBACK_LANG].file}`);
    cache[FALLBACK_LANG] = await res.json();
  }
  current = { code, dict: cache[code] };
  return current;
}

/** t("some.key") — falls back to EN, then to the raw key itself. */
export function t(key) {
  return (
    getFromDict(current.dict, key) ??
    getFromDict(cache[FALLBACK_LANG], key) ??
    key
  );
}

export function currentLanguage() {
  return current.code;
}

function getFromDict(dict, key) {
  if (!dict) return undefined;
  return key.split(".").reduce((obj, part) => (obj == null ? undefined : obj[part]), dict);
}

/** Apply t() to every [data-i18n] element in the given root. */
export function applyTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
}

export function detectPreferredLanguage() {
  const stored = localStorage.getItem("echo.lang");
  if (stored && LANGUAGES[stored]) return stored;
  const browserLang = (navigator.language || "en").slice(0, 2);
  return LANGUAGES[browserLang] ? browserLang : FALLBACK_LANG;
}

export function setPreferredLanguage(code) {
  localStorage.setItem("echo.lang", code);
}
