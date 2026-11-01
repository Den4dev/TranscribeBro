const fs = require("fs");
const path = require("path");

const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  hotkey: "Control+Alt+Space",
  activationMode: "toggle",
  model: "",
  language: "auto",
  deviceId: "default",
  pasteTarget: "current",
  keepEngineLoaded: true,
  gpu: "auto",
  customVocabulary: "",
  addTrailingSpace: true,
  playSounds: true,
  keepMicWarm: false,
  enhanceAudio: true,
  vadEnabled: false,
  saveAudio: false,
  maxDurationSec: 300,
  showOverlay: true,
  launchAtLogin: false,
  customServerPath: "",
  customModelPath: "",
  customFfmpegPath: "",
  onboarded: false,
});

const VALID_ACTIVATION = new Set(["toggle", "push-to-talk"]);
const VALID_PASTE_TARGET = new Set(["current", "captured"]);
const VALID_GPU = new Set(["auto", "cuda", "cpu"]);
const VALID_LANGUAGES = new Set([
  "auto", "ru", "en", "uk", "de", "fr", "es", "it", "pt", "pl", "tr", "nl", "cs", "sv",
  "da", "fi", "no", "ja", "ko", "zh", "ar", "hi", "he", "ro", "hu", "bg", "el", "sr",
  "hr", "sk", "sl", "lt", "lv", "et", "id", "ms", "th", "vi", "fa", "ka", "hy", "az",
  "kk", "uz", "be", "ca", "gl", "eu", "is", "mt", "sq", "mk", "bs", "af", "sw", "tl",
]);

function getConfigPath(userDataDir) {
  return path.join(userDataDir, "settings.json");
}

function sanitizeSettings(input) {
  const out = { ...DEFAULT_SETTINGS, ...(input || {}) };
  out.version = 1;
  out.hotkey = typeof out.hotkey === "string" && out.hotkey.trim() ? out.hotkey.trim() : DEFAULT_SETTINGS.hotkey;
  out.activationMode = VALID_ACTIVATION.has(out.activationMode) ? out.activationMode : DEFAULT_SETTINGS.activationMode;
  out.model = typeof out.model === "string" ? out.model.trim() : "";
  out.language = VALID_LANGUAGES.has(out.language) ? out.language : "auto";
  out.deviceId = typeof out.deviceId === "string" && out.deviceId ? out.deviceId : "default";
  out.pasteTarget = VALID_PASTE_TARGET.has(out.pasteTarget) ? out.pasteTarget : DEFAULT_SETTINGS.pasteTarget;
  out.keepEngineLoaded = !!out.keepEngineLoaded;
  out.gpu = VALID_GPU.has(out.gpu) ? out.gpu : DEFAULT_SETTINGS.gpu;
  out.customVocabulary = typeof out.customVocabulary === "string" ? out.customVocabulary.slice(0, 8000) : "";
  out.addTrailingSpace = !!out.addTrailingSpace;
  out.playSounds = !!out.playSounds;
  out.keepMicWarm = !!out.keepMicWarm;
  out.enhanceAudio = !!out.enhanceAudio;
  out.vadEnabled = !!out.vadEnabled;
  out.saveAudio = !!out.saveAudio;
  out.maxDurationSec = clampInt(out.maxDurationSec, 10, 1800, DEFAULT_SETTINGS.maxDurationSec);
  out.showOverlay = !!out.showOverlay;
  out.launchAtLogin = !!out.launchAtLogin;
  out.customServerPath = typeof out.customServerPath === "string" ? out.customServerPath.trim() : "";
  out.customModelPath = typeof out.customModelPath === "string" ? out.customModelPath.trim() : "";
  out.customFfmpegPath = typeof out.customFfmpegPath === "string" ? out.customFfmpegPath.trim() : "";
  out.onboarded = !!out.onboarded;
  return out;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function loadSettings(userDataDir) {
  const filePath = getConfigPath(userDataDir);
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    raw = {};
  }
  const settings = sanitizeSettings(raw);
  if (!settings.model) {
    settings.model = "";
  }
  return settings;
}

function saveSettings(userDataDir, settings) {
  const filePath = getConfigPath(userDataDir);
  const sanitized = sanitizeSettings(settings);
  fs.mkdirSync(userDataDir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(sanitized, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
  return sanitized;
}

module.exports = {
  DEFAULT_SETTINGS,
  VALID_LANGUAGES,
  getConfigPath,
  sanitizeSettings,
  loadSettings,
  saveSettings,
};
