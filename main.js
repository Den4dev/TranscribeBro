const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  session,
  shell,
} = require("electron");

const config = require("./src/main/config");
const { Logger } = require("./src/main/logger");
const { WhisperEngine } = require("./src/main/engine");
const { HotkeyManager } = require("./src/main/hotkey");
const { captureTarget, pasteText } = require("./src/main/paste");
const { HistoryStore } = require("./src/main/history");
const paths = require("./src/main/paths");

const APP_ID = "com.transcribebro.app";
const IS_SMOKE = process.argv.includes("--smoke-test");
const IS_SCREENSHOT = process.argv.includes("--screenshot");
const IS_HIDDEN_START = process.argv.includes("--hidden");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.setAppUserModelId(APP_ID);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let logger = null;
let userDataDir = null;
let settings = null;
let engine = null;
let hotkeys = null;
let history = null;
let tray = null;
let trayIconIdle = null;
let trayIconRecording = null;
let settingsWindow = null;
let overlayWindow = null;
let recorderWindow = null;
let quitting = false;
let shuttingDown = false;
let recorderReady = false;
let recorderReadyResolve = null;
let recorderReadyPromise = null;
let cachedDevices = [];
let deviceRequestId = 0;
const deviceResolvers = new Map();
let pendingStart = null;
let pendingStop = null;
let currentStartPromise = null;
let targetCapturePromise = null;
let overlayHideTimer = null;
let processing = false;
let recording = false;
let lastTranscript = "";
let lastStateSaveAt = 0;
let openWhisprCheckAt = 0;
let showSettingsOnReady = false;
let pendingSettingsTab = null;

let state = {
  phase: "idle",
  message: "",
  level: 0,
  startedAt: 0,
  durationMs: 0,
  transcript: "",
  error: null,
  hotkeyWarning: null,
  hotkeyError: null,
  openWhisprRunning: false,
  engineError: null,
  deviceLabel: "",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function logPath() {
  return logger ? logger.logPath : "";
}

function sendToSettings(channel, payload) {
  if (!settingsWindow || settingsWindow.isDestroyed()) return;
  if (settingsWindow.webContents.isLoading()) return;
  settingsWindow.webContents.send(channel, payload);
}

function sendToOverlay(channel, payload) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (overlayWindow.webContents.isLoading()) return;
  overlayWindow.webContents.send(channel, payload);
}

function publicState() {
  return {
    phase: state.phase,
    message: state.message,
    level: state.level,
    startedAt: state.startedAt,
    durationMs: state.durationMs,
    transcript: state.transcript,
    error: state.error,
    hotkey: settings?.hotkey || "",
    activationMode: settings?.activationMode || "toggle",
    model: engine?.modelInfo?.name || settings?.model || null,
    backend: engine?.backend || null,
    deviceName: engine?.deviceName || null,
    engineReady: !!engine?.ready,
    hotkeyWarning: state.hotkeyWarning,
    hotkeyError: state.hotkeyError,
    deviceLabel: state.deviceLabel,
  };
}

function buildState() {
  return {
    settings: settings || {},
    state: publicState(),
    engine: engine ? engine.getStatus() : null,
    hotkey: hotkeys ? hotkeys.getStatus() : null,
    models: paths.listModels(),
    devices: cachedDevices,
    history: history ? history.list({ limit: 80 }) : [],
    paths: {
      userData: userDataDir,
      modelsDirs: paths.modelDirs().map((entry) => entry.dir),
      logPath: logPath(),
      fastPaste: paths.resolveFastPaste(),
      keyListener: paths.resolveKeyListener(),
      ffmpeg: paths.resolveFfmpeg(),
      servers: paths.resolveWhisperServers(),
      vadModel: paths.resolveVadModel(),
    },
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    platform: process.platform,
    openWhisprRunning: !!state.openWhisprRunning,
    firstRun: !settings?.onboarded && !IS_SCREENSHOT,
  };
}

function sendStateToSettings() {
  sendToSettings("settings:state", buildState());
}

function sendStateToOverlay() {
  sendToOverlay("overlay:state", publicState());
}

function setPhase(phase, extra = {}) {
  state = { ...state, ...extra, phase };
  if (phase === "idle") {
    hideOverlay();
  } else if (settings?.showOverlay !== false) {
    showOverlay();
  }
  updateTrayIcon(phase === "recording" ? "recording" : "idle");
  updateTrayMenu();
  sendStateToOverlay();
  sendStateToSettings();
}

function updateLevel(level, extra = {}) {
  state.level = Math.max(0, Math.min(1, Number(level) || 0));
  if (extra.deviceLabel) state.deviceLabel = extra.deviceLabel;
  if (state.phase !== "recording") return;
  sendStateToOverlay();
  sendToSettings("settings:level", { level: state.level });
}

function clearOverlayHideTimer() {
  if (overlayHideTimer) {
    clearTimeout(overlayHideTimer);
    overlayHideTimer = null;
  }
}

function scheduleOverlayHide(delayMs) {
  clearOverlayHideTimer();
  overlayHideTimer = setTimeout(() => {
    overlayHideTimer = null;
    setPhase("idle", { level: 0 });
  }, delayMs);
}

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const isRecording = state.phase === "recording" || state.phase === "starting";
  const busy = processing || state.phase === "stopping" || state.phase === "transcribing" || state.phase === "pasting";
  const engineStatus = engine?.getStatus();
  const engineLabel = engineStatus?.ready
    ? `Модель: ${engineStatus.model || "—"} · ${engineStatus.backend || "готов"}`
    : engineStatus?.starting
      ? "Модель: загрузка…"
      : "Модель: остановлена";
  const template = [
    {
      label: isRecording ? "Остановить и вставить" : busy ? "Работаю…" : "Начать диктовку",
      enabled: !busy || isRecording,
      click: () => toggleDictation("tray"),
    },
    {
      label: "Отменить запись",
      enabled: isRecording,
      click: () => cancelDictation(),
    },
    { type: "separator" },
    { label: "Настройки…", click: () => showSettings() },
    { label: "История…", click: () => showSettings("history") },
    { label: "Файлы…", click: () => showSettings("files") },
    { type: "separator" },
    { label: engineLabel, enabled: false },
    { label: `Клавиша: ${settings?.hotkey || "—"}`, enabled: false },
    ...(state.hotkeyError ? [{ label: `Ошибка клавиши: ${state.hotkeyError}`, enabled: false }] : []),
    { type: "separator" },
    { label: "Выйти из TranscribeBro", click: () => app.quit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip(
    isRecording
      ? "TranscribeBro — запись"
      : `TranscribeBro — ${settings?.hotkey || "нет клавиши"}${engineStatus?.ready ? "" : " (движок остановлен)"}`
  );
}

function updateTrayIcon(kind) {
  if (!tray || tray.isDestroyed()) return;
  const image = kind === "recording" ? trayIconRecording : trayIconIdle;
  if (image) tray.setImage(image);
}

function createTray() {
  const assets = paths.getBundledAssetsDir();
  const idlePath = path.join(assets, "icon.png");
  const recordingPath = path.join(assets, "icon-recording.png");
  trayIconIdle = nativeImage.createFromPath(idlePath).resize({ width: 16, height: 16 });
  trayIconRecording = nativeImage.createFromPath(recordingPath).resize({ width: 16, height: 16 });
  if (trayIconIdle.isEmpty()) {
    trayIconIdle = nativeImage.createEmpty();
  }
  tray = new Tray(trayIconIdle);
  tray.on("click", () => toggleDictation("tray"));
  tray.on("double-click", () => showSettings());
  updateTrayMenu();
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 1080,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: "#0e1116",
    title: "TranscribeBro",
    autoHideMenuBar: true,
    icon: path.join(paths.getBundledAssetsDir(), "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, "src", "renderer", "settings.html"));
  settingsWindow.webContents.on("did-finish-load", () => {
    sendStateToSettings();
    if (pendingSettingsTab) {
      sendToSettings("settings:tab", pendingSettingsTab);
      pendingSettingsTab = null;
    }
    if (showSettingsOnReady) {
      showSettingsOnReady = false;
      settingsWindow.show();
      settingsWindow.focus();
    }
  });
  settingsWindow.once("ready-to-show", () => {
    if (showSettingsOnReady) {
      showSettingsOnReady = false;
      settingsWindow.show();
      settingsWindow.focus();
    }
  });
  settingsWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      settingsWindow.hide();
    }
  });
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: "deny" };
  });
}

function showSettings(tab) {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    showSettingsOnReady = true;
    createSettingsWindow();
  } else if (settingsWindow.webContents.isLoading()) {
    showSettingsOnReady = true;
  } else {
    settingsWindow.show();
    settingsWindow.focus();
  }
  if (tab) {
    pendingSettingsTab = tab;
    setTimeout(() => {
      if (!pendingSettingsTab) return;
      sendToSettings("settings:tab", pendingSettingsTab);
      pendingSettingsTab = null;
    }, 150);
  }
  sendStateToSettings();
  requestDevices().then((devices) => {
    if (devices.length) sendStateToSettings();
  });
  checkOpenWhisprRunning().then((running) => {
    if (running !== state.openWhisprRunning) {
      state.openWhisprRunning = running;
      sendStateToSettings();
    }
  });
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 460,
    height: 140,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "src", "renderer", "preload-overlay.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.loadFile(path.join(__dirname, "src", "renderer", "overlay.html"));
  overlayWindow.webContents.on("did-finish-load", () => sendStateToOverlay());
  overlayWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      overlayWindow.hide();
    }
  });
}

function positionOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  const [width, height] = overlayWindow.getSize();
  const x = Math.round(area.x + (area.width - width) / 2);
  const y = Math.round(area.y + area.height - height - 42);
  overlayWindow.setPosition(x, y, false);
}

function showOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  positionOverlay();
  if (!overlayWindow.isVisible()) overlayWindow.showInactive();
  sendStateToOverlay();
}

function hideOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.hide();
}

function createRecorderWindow() {
  recorderReady = false;
  recorderReadyPromise = new Promise((resolve) => {
    recorderReadyResolve = resolve;
  });
  recorderWindow = new BrowserWindow({
    show: false,
    width: 420,
    height: 320,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "src", "renderer", "preload-recorder.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  recorderWindow.loadFile(path.join(__dirname, "src", "renderer", "recorder.html"));
  recorderWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      recorderWindow.hide();
    }
  });
  recorderWindow.webContents.on("render-process-gone", (_event, details) => {
    logger?.error("Recorder renderer crashed", details);
    recorderReady = false;
    recording = false;
    processing = false;
    setPhase("error", { message: "Помощник микрофона аварийно завершился. Перезапустите приложение." });
    scheduleOverlayHide(5000);
  });
}

function waitForRecorderReady(timeoutMs = 8000) {
  if (recorderReady) return Promise.resolve();
  return Promise.race([
    recorderReadyPromise || Promise.resolve(),
    sleep(timeoutMs).then(() => {
      throw new Error("Помощник микрофона не запустился");
    }),
  ]);
}

function waitForRecorderStart(timeoutMs = 9000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingStart = null;
      reject(new Error("Истекло время запуска микрофона"));
    }, timeoutMs);
    pendingStart = {
      resolve: (meta) => {
        clearTimeout(timer);
        pendingStart = null;
        resolve(meta);
      },
      reject: (error) => {
        clearTimeout(timer);
        pendingStart = null;
        reject(error);
      },
    };
  });
}

function waitForRecorderStop(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingStop = null;
      reject(new Error("Истекло время остановки микрофона"));
    }, timeoutMs);
    pendingStop = {
      resolve: (payload) => {
        clearTimeout(timer);
        pendingStop = null;
        resolve(payload);
      },
      reject: (error) => {
        clearTimeout(timer);
        pendingStop = null;
        reject(error);
      },
    };
  });
}

function configureRecorder() {
  if (!recorderWindow || recorderWindow.isDestroyed() || !recorderReady) return;
  recorderWindow.webContents.send("recorder:configure", {
    deviceId: settings.deviceId,
    enhanceAudio: settings.enhanceAudio,
    keepMicWarm: settings.keepMicWarm,
    playSounds: settings.playSounds,
  });
}

function requestDevices() {
  if (!recorderWindow || recorderWindow.isDestroyed()) return Promise.resolve(cachedDevices);
  return waitForRecorderReady()
    .then(
      () =>
        new Promise((resolve) => {
          const requestId = ++deviceRequestId;
          const timer = setTimeout(() => {
            deviceResolvers.delete(requestId);
            resolve(cachedDevices);
          }, 3500);
          deviceResolvers.set(requestId, (devices) => {
            clearTimeout(timer);
            deviceResolvers.delete(requestId);
            cachedDevices = Array.isArray(devices) ? devices : [];
            resolve(cachedDevices);
          });
          recorderWindow.webContents.send("recorder:get-devices", requestId);
        })
    )
    .catch(() => cachedDevices);
}

async function startDictation(source) {
  if (processing) {
    showToast("Предыдущая диктовка ещё обрабатывается.", "info");
    return { ok: false, error: "busy" };
  }
  if (state.phase === "starting") return { ok: false, error: "starting" };
  if (recording || state.phase === "recording") return stopDictation(source);
  if (state.phase === "stopping" || state.phase === "transcribing" || state.phase === "pasting") {
    return { ok: false, error: "busy" };
  }
  clearOverlayHideTimer();
  try {
    await waitForRecorderReady();
  } catch (error) {
    setPhase("error", { message: error.message });
    scheduleOverlayHide(4000);
    return { ok: false, error: error.message };
  }

  recording = true;
  state.error = null;
  state.transcript = "";
  state.durationMs = 0;
  targetCapturePromise =
    settings.pasteTarget === "captured"
      ? captureTarget(paths.resolveFastPaste(), logger).catch(() => null)
      : Promise.resolve(null);

  setPhase("starting", { message: "Запуск микрофона…", startedAt: Date.now(), level: 0 });
  currentStartPromise = waitForRecorderStart();
  recorderWindow.webContents.send("recorder:start", {
    deviceId: settings.deviceId,
    maxDurationSec: settings.maxDurationSec,
    enhanceAudio: settings.enhanceAudio,
    keepMicWarm: settings.keepMicWarm,
    playSounds: settings.playSounds,
  });

  try {
    const meta = await currentStartPromise;
    if (!recording) return { ok: false, error: "cancelled" };
    setPhase("recording", {
      message: "Слушаю…",
      startedAt: Date.now(),
      level: 0,
      deviceLabel: meta?.deviceLabel || "",
    });
    return { ok: true };
  } catch (error) {
    recording = false;
    processing = false;
    const message = friendlyMicError(error);
    logger?.warn("Could not start microphone", { error: error.message });
    setPhase("error", { message });
    scheduleOverlayHide(4500);
    return { ok: false, error: message };
  } finally {
    currentStartPromise = null;
  }
}

async function stopDictation(source) {
  if (state.phase === "starting" && currentStartPromise) {
    try {
      await currentStartPromise;
    } catch {
      return { ok: false, error: "start_failed" };
    }
  }
  if (!recording) return { ok: false, error: "not_recording" };
  recording = false;
  clearOverlayHideTimer();
  setPhase("stopping", { message: "Остановка…" });
  const stopPromise = waitForRecorderStop();
  recorderWindow.webContents.send("recorder:stop");
  let payload;
  try {
    payload = await stopPromise;
  } catch (error) {
    processing = false;
    setPhase("error", { message: friendlyMicError(error) });
    scheduleOverlayHide(4500);
    return { ok: false, error: error.message };
  }
  return processRecording(payload);
}

async function processRecording(payload) {
  processing = true;
  const durationMs = Number(payload?.durationMs) || 0;
  const target = settings.pasteTarget === "captured" ? await targetCapturePromise : null;
  try {
    if (!payload?.wav || durationMs < 280 || Number(payload.peak || 0) < 0.0012) {
      processing = false;
      setPhase("error", { message: "Речь не обнаружена. Попробуйте ещё раз, ближе к микрофону." });
      scheduleOverlayHide(3000);
      return { ok: false, error: "no_speech" };
    }

    setPhase("transcribing", { message: "Распознавание…", durationMs });
    if (!engine.getStatus().ready) {
      setPhase("transcribing", { message: "Загрузка модели Whisper…", durationMs });
      await engine.start();
      updateEngineState();
    }

    const result = await engine.transcribe(Buffer.from(payload.wav), {
      language: settings.language,
      prompt: settings.customVocabulary,
    });
    const text = String(result.text || "").trim();
    if (!text) {
      processing = false;
      setPhase("error", { message: "В записи не обнаружена речь." });
      scheduleOverlayHide(3000);
      return { ok: false, error: "no_speech" };
    }

    lastTranscript = text;
    const pasteValue = settings.addTrailingSpace ? `${text} ` : text;
    setPhase("pasting", { message: "Вставка текста…", durationMs, transcript: text });
    const pasteResult = await pasteText({
      text: pasteValue,
      target,
      fastPastePath: paths.resolveFastPaste(),
      logger,
      restorePreviousClipboard: true,
    });

    let audioPath = null;
    if (settings.saveAudio) {
      audioPath = saveAudio(Buffer.from(payload.wav));
    }
    const entry = history.add({
      text,
      durationMs,
      model: engine.modelInfo?.name,
      language: result.language,
      source: "dictation",
      audioPath,
    });

    if (pasteResult.success) {
      setPhase("success", { message: "Вставлено", transcript: text, durationMs });
      scheduleOverlayHide(1800);
    } else {
      setPhase("error", {
        message: "Текст скопирован в буфер обмена — нажмите Ctrl+V",
        transcript: text,
        durationMs,
      });
      scheduleOverlayHide(5000);
    }
    sendStateToSettings();
    return { ok: true, text, paste: pasteResult, entry };
  } catch (error) {
    logger?.error("Dictation failed", { error: error.message, code: error.code });
    setPhase("error", {
      message: friendlyEngineError(error),
      transcript: lastTranscript,
      durationMs,
    });
    scheduleOverlayHide(5500);
    return { ok: false, error: error.message };
  } finally {
    processing = false;
    targetCapturePromise = null;
  }
}

async function cancelDictation() {
  if (recorderWindow && !recorderWindow.isDestroyed()) {
    recorderWindow.webContents.send("recorder:cancel");
  }
  recording = false;
  processing = false;
  clearOverlayHideTimer();
  setPhase("idle", { level: 0, message: "" });
  return { ok: true };
}

function toggleDictation(source) {
  if (recording || state.phase === "starting") return stopDictation(source);
  return startDictation(source);
}

function saveAudio(wavBuffer) {
  const dir = paths.getAudioDir();
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(dir, `dictation-${stamp}.wav`);
  fs.writeFileSync(filePath, wavBuffer);
  return filePath;
}

function updateEngineState() {
  if (!engine) return;
  const status = engine.getStatus();
  state.engineError = status.error || null;
  state.model = status.model;
  state.backend = status.backend;
  sendStateToSettings();
  updateTrayMenu();
}

function applySettings(next, { persist = true, initial = false } = {}) {
  const previous = settings;
  settings = config.sanitizeSettings(next);
  if (persist) config.saveSettings(userDataDir, settings);

  if (
    hotkeys &&
    (initial ||
      previous.hotkey !== settings.hotkey ||
      previous.activationMode !== settings.activationMode)
  ) {
    const result = hotkeys.apply(settings.hotkey, settings.activationMode);
    if (!result.ok) {
      settings = previous;
      if (persist) config.saveSettings(userDataDir, settings);
      hotkeys.apply(settings.hotkey, settings.activationMode);
      state.hotkeyError = result.error || "Не удалось зарегистрировать горячую клавишу";
      sendStateToSettings();
      return { ok: false, error: state.hotkeyError, settings };
    }
    state.hotkeyError = null;
    state.hotkeyWarning = result.warning || null;
  }

  const engineKeys = ["model", "gpu", "customServerPath", "customModelPath", "vadEnabled"];
  const engineChanged = engineKeys.some((key) => previous[key] !== settings[key]);
  if (engine && !initial && engineChanged) {
    if (engine.ready || engine.startingPromise) {
      setPhase(state.phase === "idle" ? "idle" : state.phase, {
        message: "Перезапуск движка Whisper…",
      });
      engine
        .restart()
        .then(() => {
          updateEngineState();
          showToast("Движок Whisper перезапущен.", "success");
        })
        .catch((error) => {
          state.engineError = error.message;
          logger?.error("Engine restart failed", { error: error.message });
          sendStateToSettings();
          showToast(`Не удалось перезапустить движок: ${error.message}`, "error");
        });
    } else if (settings.keepEngineLoaded) {
      engine
        .start()
        .then(() => updateEngineState())
        .catch((error) => {
          state.engineError = error.message;
          sendStateToSettings();
        });
    }
  }

  if (
    !initial &&
    (previous.keepMicWarm !== settings.keepMicWarm ||
      previous.deviceId !== settings.deviceId ||
      previous.enhanceAudio !== settings.enhanceAudio ||
      previous.playSounds !== settings.playSounds)
  ) {
    configureRecorder();
  }
  if (!initial && previous.launchAtLogin !== settings.launchAtLogin) {
    applyLoginItem();
  }
  updateTrayMenu();
  sendStateToSettings();
  return { ok: true, settings, hotkey: hotkeys ? hotkeys.getStatus() : null };
}

function updateSettings(partial) {
  const next = config.sanitizeSettings({ ...settings, ...(partial || {}) });
  return applySettings(next, { persist: true });
}

function friendlyMicError(error) {
  const name = error?.name || "";
  const message = error?.message || String(error);
  if (name === "too_short") return "Запись слишком короткая. Удерживайте клавишу чуть дольше.";
  if (name === "NotAllowedError" || /permission/i.test(message)) {
    return "Доступ к микрофону заблокирован. Разрешите TranscribeBro доступ к микрофону в настройках Windows.";
  }
  if (name === "NotFoundError" || /not found/i.test(message)) return "Микрофон не найден.";
  if (name === "NotReadableError" || /busy/i.test(message)) {
    return "Микрофон занят другим приложением. Закройте его и попробуйте снова.";
  }
  return `Ошибка микрофона: ${message}`;
}

function friendlyEngineError(error) {
  if (!error) return "Не удалось выполнить распознавание.";
  if (error.code === "model_missing") return "Модель Whisper не найдена. Откройте «Модели» и выберите модель.";
  if (error.code === "server_missing") {
    return "whisper-server не найден. Установите OpenWhispr или укажите свой путь к серверу.";
  }
  if (error.code === "start_timeout" || error.code === "server_exited") {
    return "Локальный движок Whisper не запустился. Проверьте «Модели» → «Открыть логи».";
  }
  if (error.code === "ffmpeg_missing") return "FFmpeg не найден для распознавания файлов.";
  return error.message || "Не удалось выполнить распознавание.";
}

function showToast(message, kind = "info") {
  sendToSettings("settings:toast", { message, kind, at: Date.now() });
}

function applyLoginItem() {
  if (!app.isPackaged) return;
  try {
    app.setLoginItemSettings({
      openAtLogin: !!settings.launchAtLogin,
      path: process.execPath,
      args: ["--hidden"],
    });
  } catch (error) {
    logger?.warn("Could not update login item", { error: error.message });
  }
}

function openExternalSafe(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return false;
    const allowed = ["github.com", "huggingface.co", "openwhispr.com", "www.openwhispr.com"];
    if (!allowed.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      return false;
    }
    shell.openExternal(rawUrl);
    return true;
  } catch {
    return false;
  }
}

function checkOpenWhisprRunning() {
  if (process.platform !== "win32") return Promise.resolve(false);
  if (Date.now() - openWhisprCheckAt < 5000) return Promise.resolve(state.openWhisprRunning);
  openWhisprCheckAt = Date.now();
  return new Promise((resolve) => {
    execFile(
      "tasklist",
      ["/FI", "IMAGENAME eq OpenWhispr.exe", "/FO", "CSV", "/NH"],
      { windowsHide: true, timeout: 3000 },
      (error, stdout) => {
        const running = !error && /OpenWhispr\.exe/i.test(String(stdout || ""));
        resolve(running);
      }
    );
  });
}

async function transcribeFile(filePath) {
  if (processing) return { ok: false, error: "busy" };
  if (!filePath) return { ok: false, error: "Файл не выбран" };
  processing = true;
  clearOverlayHideTimer();
  setPhase("transcribing", { message: `Распознавание ${path.basename(filePath)}…` });
  try {
    if (!engine.getStatus().ready) {
      setPhase("transcribing", { message: "Загрузка модели Whisper…" });
      await engine.start();
      updateEngineState();
    }
    const result = await engine.transcribeFile(filePath, {
      language: settings.language,
      prompt: settings.customVocabulary,
      ffmpegPath: settings.customFfmpegPath || paths.resolveFfmpeg(),
      onProgress: (progress) => sendToSettings("settings:file-progress", progress),
    });
    const text = String(result.text || "").trim();
    if (!text) {
      setPhase("error", { message: "В этом файле не обнаружена речь." });
      scheduleOverlayHide(3200);
      return { ok: false, error: "no_speech" };
    }
    lastTranscript = text;
    const entry = history.add({
      text,
      durationMs: Math.round((result.durationSec || 0) * 1000),
      model: engine.modelInfo?.name,
      language: result.language,
      source: "file",
    });
    setPhase("success", {
      message: "Файл распознан",
      transcript: text,
      durationMs: Math.round((result.durationSec || 0) * 1000),
    });
    scheduleOverlayHide(2200);
    return { ok: true, text, entry, durationSec: result.durationSec };
  } catch (error) {
    logger?.error("File transcription failed", { error: error.message, code: error.code });
    setPhase("error", { message: friendlyEngineError(error) });
    scheduleOverlayHide(5500);
    return { ok: false, error: friendlyEngineError(error) };
  } finally {
    processing = false;
  }
}

function setupIpc() {
  ipcMain.handle("settings:get-state", () => buildState());
  ipcMain.handle("settings:update", (_event, partial) => updateSettings(partial));
  ipcMain.handle("settings:suspend-hotkeys", () => {
    hotkeys?.suspend();
    return true;
  });
  ipcMain.handle("settings:resume-hotkeys", () => {
    hotkeys?.resume();
    return hotkeys ? hotkeys.getStatus() : null;
  });
  ipcMain.handle("settings:start-dictation", () => startDictation("ui"));
  ipcMain.handle("settings:stop-dictation", () => stopDictation("ui"));
  ipcMain.handle("settings:cancel-dictation", () => cancelDictation());
  ipcMain.handle("settings:copy-text", (_event, text) => {
    clipboard.writeText(String(text || ""));
    return true;
  });
  ipcMain.handle("settings:paste-text", (_event, text) =>
    pasteText({
      text: String(text || ""),
      target: null,
      fastPastePath: paths.resolveFastPaste(),
      logger,
      restorePreviousClipboard: true,
    })
  );
  ipcMain.handle("settings:get-devices", () => requestDevices());
  ipcMain.handle("settings:choose-file", async () => {
    const result = await dialog.showOpenDialog(settingsWindow, {
      properties: ["openFile"],
      filters: [
        {
          name: "Аудио и видео",
          extensions: [
            "wav", "mp3", "m4a", "webm", "ogg", "oga", "flac", "aac", "opus", "wma",
            "mp4", "mkv", "mov", "avi", "m4v", "mpg", "mpeg", "ts",
          ],
        },
        { name: "Все файлы", extensions: ["*"] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("settings:choose-path", async (_event, options) => {
    const result = await dialog.showOpenDialog(settingsWindow, {
      title: options?.title || "Выберите файл",
      properties: ["openFile"],
      filters: options?.filters || [{ name: "Все файлы", extensions: ["*"] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("settings:transcribe-file", (_event, filePath) => transcribeFile(filePath));
  ipcMain.handle("settings:get-history", (_event, query) =>
    history.list({ query: query || "", limit: 200 })
  );
  ipcMain.handle("settings:delete-history", (_event, id) => {
    const removed = history.remove(id);
    sendStateToSettings();
    return removed;
  });
  ipcMain.handle("settings:clear-history", () => {
    history.clear();
    sendStateToSettings();
    return true;
  });
  ipcMain.handle("settings:restart-engine", async () => {
    try {
      setPhase(state.phase === "idle" ? "idle" : state.phase, { message: "Перезапуск движка Whisper…" });
      await engine.restart();
      updateEngineState();
      showToast("Движок Whisper перезапущен.", "success");
      return { ok: true, status: engine.getStatus() };
    } catch (error) {
      state.engineError = error.message;
      sendStateToSettings();
      return { ok: false, error: friendlyEngineError(error) };
    }
  });
  ipcMain.handle("settings:stop-engine", async () => {
    await engine.stop();
    updateEngineState();
    return { ok: true, status: engine.getStatus() };
  });
  ipcMain.handle("settings:open-path", async (_event, targetPath) => {
    if (!targetPath) return false;
    const result = await shell.openPath(String(targetPath));
    return !result;
  });
  ipcMain.handle("settings:open-models-folder", async () => {
    const dir = path.join(userDataDir, "models");
    fs.mkdirSync(dir, { recursive: true });
    await shell.openPath(dir);
    return dir;
  });
  ipcMain.handle("settings:open-logs", async () => {
    if (!logger) return false;
    await shell.openPath(logger.logPath);
    return true;
  });
  ipcMain.handle("settings:get-log", () => (logger ? logger.tail(300) : ""));
  ipcMain.handle("settings:open-external", (_event, url) => openExternalSafe(String(url || "")));
  ipcMain.handle("settings:open-mic-settings", async () => {
    await shell.openExternal("ms-settings:privacy-microphone");
    return true;
  });
  ipcMain.handle("settings:save-text", async (_event, payload) => {
    const { text, defaultName } = payload || {};
    const result = await dialog.showSaveDialog(settingsWindow, {
      defaultPath: defaultName || "transcript.txt",
      filters: [{ name: "Текст", extensions: ["txt", "md"] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };
    fs.writeFileSync(result.filePath, String(text || ""), "utf8");
    return { ok: true, path: result.filePath };
  });
  ipcMain.handle("settings:set-onboarded", () => {
    settings.onboarded = true;
    config.saveSettings(userDataDir, settings);
    sendStateToSettings();
    return true;
  });
  ipcMain.handle("settings:quit", () => {
    app.quit();
    return true;
  });

  ipcMain.handle("overlay:get-state", () => publicState());
  ipcMain.on("overlay:hide", () => hideOverlay());

  ipcMain.on("recorder:ready", () => {
    recorderReady = true;
    if (recorderReadyResolve) {
      recorderReadyResolve();
      recorderReadyResolve = null;
    }
    configureRecorder();
    requestDevices();
    sendStateToSettings();
  });
  ipcMain.on("recorder:started", (_event, meta) => {
    if (pendingStart) pendingStart.resolve(meta || {});
  });
  ipcMain.on("recorder:result", (_event, payload) => {
    if (pendingStop) pendingStop.resolve(payload || {});
  });
  ipcMain.on("recorder:error", (_event, payload) => {
    const error = new Error(payload?.message || "Ошибка микрофона");
    error.name = payload?.code || "mic_error";
    if (pendingStart) {
      pendingStart.reject(error);
      return;
    }
    if (pendingStop) {
      pendingStop.reject(error);
      return;
    }
    logger?.warn("Recorder error", payload);
    recording = false;
    processing = false;
    setPhase("error", { message: friendlyMicError(error) });
    scheduleOverlayHide(4500);
  });
  ipcMain.on("recorder:level", (_event, payload) => {
    updateLevel(payload?.level, { deviceLabel: payload?.deviceLabel });
  });
  ipcMain.on("recorder:devices", (_event, payload) => {
    const resolver = deviceResolvers.get(payload?.requestId);
    if (resolver) resolver(payload?.devices || []);
  });
  ipcMain.on("recorder:configured", (_event, meta) => {
    logger?.debug("Recorder configured", meta);
    if (meta?.error) {
      showToast(`Не удалось подготовить микрофон: ${meta.error}`, "error");
    }
  });
}

function installPermissionHandlers() {
  const allowMedia = (permission) => permission === "media" || permission === "audioCapture";
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowMedia(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => allowMedia(permission));
}

async function bootstrap() {
  userDataDir = app.getPath("userData");
  logger = new Logger(paths.getLogDir());
  logger.info("TranscribeBro starting", {
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
  });

  settings = config.loadSettings(userDataDir);
  const models = paths.listModels();
  if (!settings.model && models.length) {
    settings.model = pickDefaultModel(models).name;
  }
  if (!settings.model) {
    const probe = new WhisperEngine({ logger, settingsProvider: () => settings, userDataDir });
    const resolved = probe.resolveModel();
    if (resolved) settings.model = resolved.name;
  }
  config.saveSettings(userDataDir, settings);

  history = new HistoryStore({ userDataDir, logger });
  engine = new WhisperEngine({ logger, settingsProvider: () => settings, userDataDir });

  if (IS_SMOKE) {
    await runSmokeTest();
    return;
  }

  installPermissionHandlers();
  setupIpc();
  createRecorderWindow();
  createOverlayWindow();
  createSettingsWindow();
  createTray();

  hotkeys = new HotkeyManager({
    logger,
    keyListenerPath: paths.resolveKeyListener(),
    callbacks: {
      onToggle: (source) => toggleDictation(source),
      onStart: (source) => startDictation(source),
      onStop: (source) => stopDictation(source),
    },
  });
  hotkeys.on("error", (error) => {
    logger?.error("Hotkey error", { error: error.message });
    state.hotkeyError = error.message;
    sendStateToSettings();
    updateTrayMenu();
  });
  hotkeys.on("status", () => {
    sendStateToSettings();
    updateTrayMenu();
  });

  const applied = applySettings(settings, { persist: false, initial: true });
  if (!applied.ok) {
    state.hotkeyError = applied.error;
  }
  configureRecorder();
  applyLoginItem();
  checkOpenWhisprRunning().then((running) => {
    state.openWhisprRunning = running;
    sendStateToSettings();
  });

  if (settings.keepEngineLoaded) {
    setPhase("idle", { message: "" });
    engine
      .start()
      .then(() => updateEngineState())
      .catch((error) => {
        logger?.warn("Engine preload failed", { error: error.message, code: error.code });
        state.engineError = error.message;
        sendStateToSettings();
      });
  }

  const shouldShow =
    !settings.onboarded ||
    process.argv.includes("--settings") ||
    process.argv.includes("--dev") ||
    IS_SCREENSHOT;
  if (shouldShow && !(IS_HIDDEN_START && settings.onboarded)) {
    showSettings();
  }

  if (IS_SCREENSHOT) {
    setTimeout(() => captureScreenshot(), 2500);
  }

  app.on("second-instance", () => showSettings());
  app.on("activate", () => showSettings());
}

function pickDefaultModel(models) {
  const preferred = ["medium", "large-v3-turbo", "large-v3", "small", "base", "tiny"];
  for (const name of preferred) {
    const found = models.find((model) => model.name === name);
    if (found) return found;
  }
  return models[0];
}

async function runSmokeTest() {
  try {
    console.log("SMOKE: starting engine");
    const status = await engine.start();
    console.log("SMOKE: engine ready", JSON.stringify(status));
    const testPath =
      process.env.SMOKE_WAV ||
      path.join(process.env.TEMP || process.env.LOCALAPPDATA || ".", "opencode", "test16k.wav");
    if (fs.existsSync(testPath)) {
      const wav = fs.readFileSync(testPath);
      const result = await engine.transcribe(wav, { language: "auto" });
      console.log("SMOKE: transcript", JSON.stringify(result.text));
      if (!result.text) {
        console.error("SMOKE: transcript was empty");
        process.exitCode = 1;
      }
    } else {
      console.log("SMOKE: no test WAV at", testPath);
    }
    console.log("SMOKE: OK");
  } catch (error) {
    console.error("SMOKE: FAILED", error);
    process.exitCode = 1;
  } finally {
    try {
      await engine.stop();
    } catch {
      // Ignore shutdown errors.
    }
    setTimeout(() => app.exit(process.exitCode || 0), 100);
  }
}

async function captureScreenshot() {
  try {
    if (!settingsWindow || settingsWindow.isDestroyed()) return;
    if (!settingsWindow.isVisible()) settingsWindow.show();
    settingsWindow.focus();
    await sleep(800);
    const image = await settingsWindow.webContents.capturePage();
    const output = path.join(__dirname, "screenshot.png");
    fs.writeFileSync(output, image.toPNG());
    console.log("SCREENSHOT:", output);
  } catch (error) {
    console.error("SCREENSHOT FAILED", error);
  } finally {
    setTimeout(() => app.exit(0), 200);
  }
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  quitting = true;
  logger?.info("TranscribeBro shutting down");
  try {
    hotkeys?.stop();
  } catch {
    // Ignore.
  }
  try {
    globalShortcut.unregisterAll();
  } catch {
    // Ignore.
  }
  try {
    await engine?.stop();
  } catch {
    // Ignore.
  }
  app.exit(0);
}

if (gotLock) {
  app.whenReady().then(bootstrap).catch((error) => {
    try {
      logger?.error("Fatal startup error", { error: error.stack || error.message });
    } catch {
      // Ignore.
    }
    console.error("Fatal startup error", error);
    app.exit(1);
  });

  app.on("window-all-closed", () => {
    // Keep the tray app alive.
  });

  app.on("before-quit", (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    shutdown();
  });

  process.on("uncaughtException", (error) => {
    try {
      logger?.error("Uncaught exception", { error: error.stack || error.message });
    } catch {
      // Ignore.
    }
    console.error("Uncaught exception", error);
  });

  process.on("unhandledRejection", (reason) => {
    try {
      logger?.error("Unhandled rejection", { reason: String(reason) });
    } catch {
      // Ignore.
    }
  });
}
