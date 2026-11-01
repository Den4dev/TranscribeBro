const { spawn } = require("child_process");
const EventEmitter = require("events");

const MODIFIER_ALIASES = new Map([
  ["ctrl", "ctrl"],
  ["control", "ctrl"],
  ["cmdorctrl", "ctrl"],
  ["commandorcontrol", "ctrl"],
  ["alt", "alt"],
  ["option", "alt"],
  ["shift", "shift"],
  ["super", "super"],
  ["win", "super"],
  ["meta", "super"],
  ["command", "super"],
  ["cmd", "super"],
]);

const RIGHT_MODIFIERS = new Set([
  "rightalt",
  "rightoption",
  "rightcontrol",
  "rightctrl",
  "rightshift",
  "rightsuper",
  "rightwin",
  "rightmeta",
  "rightcommand",
  "rightcmd",
]);

const ELECTRON_KEY_NAMES = new Map([
  ["space", "Space"],
  ["esc", "Escape"],
  ["escape", "Escape"],
  ["tab", "Tab"],
  ["enter", "Enter"],
  ["return", "Enter"],
  ["backspace", "Backspace"],
  ["delete", "Delete"],
  ["insert", "Insert"],
  ["home", "Home"],
  ["end", "End"],
  ["pageup", "PageUp"],
  ["pagedown", "PageDown"],
  ["up", "Up"],
  ["down", "Down"],
  ["left", "Left"],
  ["right", "Right"],
  ["capslock", "CapsLock"],
  ["numlock", "NumLock"],
  ["scrolllock", "ScrollLock"],
  ["pause", "Pause"],
  ["printscreen", "PrintScreen"],
  ["`", "`"],
  ["backquote", "`"],
  ["-", "-"],
  ["minus", "-"],
  ["=", "="],
  ["equal", "="],
  ["[", "["],
  ["]", "]"],
  ["\\", "\\"],
  [";", ";"],
  ["'", "'"],
  [",", ","],
  [".", "."],
  ["/", "/"],
]);

function parseHotkey(hotkey) {
  const tokens = String(hotkey || "")
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);
  const modifiers = new Set();
  let mainKey = null;
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (MODIFIER_ALIASES.has(lower)) {
      modifiers.add(MODIFIER_ALIASES.get(lower));
    } else {
      mainKey = token;
    }
  }
  return { tokens, modifiers, mainKey };
}

function needsNativeListener(hotkey, activationMode) {
  if (activationMode === "push-to-talk") return true;
  const parsed = parseHotkey(hotkey);
  if (!parsed.mainKey) return true;
  return RIGHT_MODIFIERS.has(parsed.mainKey.toLowerCase());
}

function toElectronAccelerator(hotkey) {
  const parsed = parseHotkey(hotkey);
  const parts = [];
  if (parsed.modifiers.has("ctrl")) parts.push("Control");
  if (parsed.modifiers.has("alt")) parts.push("Alt");
  if (parsed.modifiers.has("shift")) parts.push("Shift");
  if (parsed.modifiers.has("super")) parts.push("Super");
  if (!parsed.mainKey) return parts.join("+");
  parts.push(normalizeElectronKey(parsed.mainKey));
  return parts.join("+");
}

function normalizeElectronKey(key) {
  const lower = key.toLowerCase();
  if (ELECTRON_KEY_NAMES.has(lower)) return ELECTRON_KEY_NAMES.get(lower);
  if (/^f([1-9]|1\d|2[0-4])$/i.test(key)) return key.toUpperCase();
  if (key.length === 1) return key.toUpperCase();
  if (lower === "plus") return "Plus";
  if (lower === "comma") return ",";
  if (lower === "period") return ".";
  return key;
}

function isLikelyValidHotkey(hotkey) {
  const parsed = parseHotkey(hotkey);
  if (!parsed.tokens.length) return false;
  if (!parsed.mainKey) {
    return parsed.modifiers.size > 0 && !(parsed.modifiers.size === 1 && parsed.modifiers.has("shift"));
  }
  if (!/^[a-z0-9`\-=[\]\\;',./]$/i.test(parsed.mainKey) && !/^F([1-9]|1\d|2[0-4])$/i.test(parsed.mainKey)) {
    const lower = parsed.mainKey.toLowerCase();
    if (!ELECTRON_KEY_NAMES.has(lower) && !RIGHT_MODIFIERS.has(lower)) return false;
  }
  return true;
}

class HotkeyManager extends EventEmitter {
  constructor({ logger, keyListenerPath, callbacks = {} }) {
    super();
    this.logger = logger;
    this.keyListenerPath = keyListenerPath;
    this.callbacks = callbacks;
    this.hotkey = null;
    this.activationMode = "toggle";
    this.globalAccelerator = null;
    this.nativeProcess = null;
    this.nativeKey = null;
    this.nativeRestarts = 0;
    this.restartTimer = null;
    this.suspended = false;
    this.stopped = false;
    this.lastTriggerAt = 0;
    this.mode = null;
  }

  apply(hotkey, activationMode) {
    const { globalShortcut } = require("electron");
    this._clearGlobal(globalShortcut);
    this._stopNative();
    this.hotkey = hotkey;
    this.activationMode = activationMode || "toggle";
    this.stopped = false;
    this.suspended = false;

    if (!isLikelyValidHotkey(hotkey)) {
      const error = new Error(`Неподдерживаемая горячая клавиша: ${hotkey}`);
      this.emit("error", error);
      return { ok: false, error: error.message };
    }

    if (needsNativeListener(hotkey, this.activationMode)) {
      const result = this._startNative(hotkey);
      this.mode = result.ok ? "native" : null;
      return result;
    }

    const accelerator = toElectronAccelerator(hotkey);
    try {
      const registered = globalShortcut.register(accelerator, () => this._onGlobalTrigger());
      if (registered) {
        this.globalAccelerator = accelerator;
        this.mode = "global";
        this.logger.info("Registered global hotkey", { hotkey, accelerator, mode: this.activationMode });
        this.emit("status", this.getStatus());
        return { ok: true, mode: "global", accelerator };
      }
    } catch (error) {
      this.logger.warn("globalShortcut.register threw", { error: error.message });
    }

    this.logger.warn("Global hotkey unavailable, falling back to native listener", { hotkey });
    const result = this._startNative(hotkey);
    if (result.ok) {
      result.warning = "Клавиша зарегистрирована через низкоуровневый обработчик и может также доходить до активного приложения.";
      this.mode = "native";
    }
    return result;
  }

  _onGlobalTrigger() {
    if (this.suspended || this.stopped) return;
    const now = Date.now();
    if (now - this.lastTriggerAt < 250) return;
    this.lastTriggerAt = now;
    if (this.activationMode === "push-to-talk") {
      this.callbacks.onStart?.("global");
    } else {
      this.callbacks.onToggle?.("global");
    }
  }

  _startNative(hotkey) {
    if (!this.keyListenerPath) {
      const error = new Error(
        "windows-key-listener.exe не найден. Обычные горячие клавиши работают, но для сочетаний только из модификаторов и режима удержания он нужен."
      );
      this.emit("error", error);
      return { ok: false, error: error.message };
    }
    this._stopNative();
    this.nativeKey = hotkey;
    this.stopped = false;
    const child = spawn(this.keyListenerPath, [hotkey], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.nativeProcess = child;
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (line === "READY") {
          this.nativeRestarts = 0;
          this.logger.info("Native key listener ready", { hotkey });
          this.emit("status", this.getStatus());
        } else if (line === "KEY_DOWN") {
          this._onNativeDown();
        } else if (line === "KEY_UP") {
          this._onNativeUp();
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (data) => {
      const message = data.toString().trim();
      if (message) this.logger.debug("Native key listener stderr", { message });
    });
    child.on("error", (error) => {
      this.logger.error("Native key listener error", { error: error.message });
      this.emit("error", error);
    });
    child.on("close", (code, signal) => {
      if (this.nativeProcess !== child) return;
      this.nativeProcess = null;
      if (this.stopped || this.suspended) return;
      this.logger.warn("Native key listener exited", { code, signal, hotkey });
      if (this.nativeRestarts < 3) {
        this.nativeRestarts += 1;
        this.restartTimer = setTimeout(() => {
          if (!this.stopped && !this.suspended) this._startNative(hotkey);
        }, 1500);
      } else {
        this.emit("error", new Error(`Низкоуровневый обработчик клавиш завершился (код ${code ?? "null"})`));
      }
    });
    this.mode = "native";
    this.emit("status", this.getStatus());
    return { ok: true, mode: "native" };
  }

  _onNativeDown() {
    if (this.suspended || this.stopped) return;
    const now = Date.now();
    if (now - this.lastTriggerAt < 200) return;
    this.lastTriggerAt = now;
    if (this.activationMode === "push-to-talk") {
      this.callbacks.onStart?.("native");
    } else {
      this.callbacks.onToggle?.("native");
    }
  }

  _onNativeUp() {
    if (this.suspended || this.stopped) return;
    if (this.activationMode === "push-to-talk") {
      this.callbacks.onStop?.("native");
    }
  }

  suspend() {
    const { globalShortcut } = require("electron");
    this.suspended = true;
    this._clearGlobal(globalShortcut);
    this._stopNative();
    this.mode = null;
    this.emit("status", this.getStatus());
  }

  resume() {
    this.suspended = false;
    if (this.hotkey) this.apply(this.hotkey, this.activationMode);
  }

  stop() {
    const { globalShortcut } = require("electron");
    this.stopped = true;
    this._clearGlobal(globalShortcut);
    this._stopNative();
    this.mode = null;
  }

  _clearGlobal(globalShortcut) {
    if (this.globalAccelerator) {
      try {
        globalShortcut.unregister(this.globalAccelerator);
      } catch {
        // Already unregistered.
      }
      this.globalAccelerator = null;
    }
  }

  _stopNative() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const child = this.nativeProcess;
    this.nativeProcess = null;
    if (child) {
      try {
        child.kill();
      } catch {
        // Already gone.
      }
    }
  }

  getStatus() {
    return {
      hotkey: this.hotkey,
      mode: this.mode,
      activationMode: this.activationMode,
      native: this.mode === "native",
      suspended: this.suspended,
      keyListenerPath: this.keyListenerPath,
    };
  }
}

module.exports = {
  HotkeyManager,
  parseHotkey,
  toElectronAccelerator,
  needsNativeListener,
  isLikelyValidHotkey,
};
