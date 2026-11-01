const api = window.transcribeBro;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const LANGUAGES = [
  ["auto", "Автоопределение"],
  ["en", "Английский"],
  ["ru", "Русский"],
  ["uk", "Украинский"],
  ["de", "Немецкий"],
  ["fr", "Французский"],
  ["es", "Испанский"],
  ["it", "Итальянский"],
  ["pt", "Португальский"],
  ["pl", "Польский"],
  ["tr", "Турецкий"],
  ["nl", "Нидерландский"],
  ["cs", "Чешский"],
  ["sv", "Шведский"],
  ["da", "Датский"],
  ["fi", "Финский"],
  ["no", "Норвежский"],
  ["ja", "Японский"],
  ["ko", "Корейский"],
  ["zh", "Китайский"],
  ["ar", "Арабский"],
  ["hi", "Хинди"],
  ["he", "Иврит"],
  ["ro", "Румынский"],
  ["hu", "Венгерский"],
  ["bg", "Болгарский"],
  ["el", "Греческий"],
  ["sr", "Сербский"],
  ["hr", "Хорватский"],
  ["sk", "Словацкий"],
  ["sl", "Словенский"],
  ["lt", "Литовский"],
  ["lv", "Латышский"],
  ["et", "Эстонский"],
  ["id", "Индонезийский"],
  ["ms", "Малайский"],
  ["th", "Тайский"],
  ["vi", "Вьетнамский"],
  ["fa", "Персидский"],
  ["ka", "Грузинский"],
  ["hy", "Армянский"],
  ["az", "Азербайджанский"],
  ["kk", "Казахский"],
  ["uz", "Узбекский"],
  ["be", "Белорусский"],
  ["ca", "Каталанский"],
  ["gl", "Галисийский"],
  ["eu", "Баскский"],
  ["is", "Исландский"],
  ["mt", "Мальтийский"],
  ["sq", "Албанский"],
  ["mk", "Македонский"],
  ["bs", "Боснийский"],
  ["af", "Африкаанс"],
  ["sw", "Суахили"],
  ["tl", "Тагальский"],
];

const PAGE_META = {
  dictation: ["Диктовка", "Говорите естественно. TranscribeBro вставит текст в активное приложение."],
  models: ["Локальные модели", "Whisper работает полностью на этом ПК."],
  history: ["История", "Все транскрипции — с поиском и повторным использованием."],
  files: ["Транскрипция файла", "Превращайте аудио и видео в текст локально."],
  about: ["О программе", "Локальная диктовка для Windows."],
};

const TOGGLE_IDS = [
  "enhanceAudio",
  "keepMicWarm",
  "addTrailingSpace",
  "playSounds",
  "showOverlay",
  "saveAudio",
  "launchAtLogin",
  "keepEngineLoaded",
  "vadEnabled",
];

const SOURCE_LABELS = {
  user: "TranscribeBro",
  openwhispr: "Кэш OpenWhispr",
  project: "Проект",
  bundled: "Встроенная",
  whisper: "Кэш Whisper",
  custom: "Своя",
};

const ui = {
  body: document.body,
  content: $(".content"),
  navItems: $$(".nav-item"),
  panels: $$(".tab-panel"),
  pageTitle: $("#pageTitle"),
  pageSubtitle: $("#pageSubtitle"),
  versionLabel: $("#versionLabel"),
  saveStatus: $("#saveStatus"),
  statusPill: $("#statusPill"),
  statusDot: $("#statusDot"),
  statusText: $("#statusText"),
  hotkeyChip: $("#hotkeyChip"),
  hotkeyChipKeys: $("#hotkeyChipKeys"),
  heroHotkey: $("#heroHotkey"),
  heroMode: $("#heroMode"),
  recordButton: $("#recordButton"),
  recordButtonIcon: $("#recordButtonIcon"),
  recordButtonLabel: $("#recordButtonLabel"),
  changeHotkeyButton: $("#changeHotkeyButton"),
  levelBar: $("#levelBar"),
  deviceLabel: $("#deviceLabel"),
  engineMiniDot: $("#engineMiniDot"),
  engineMiniTitle: $("#engineMiniTitle"),
  engineMiniSub: $("#engineMiniSub"),
  bannerStack: $("#bannerStack"),
  pasteTargetGroup: $("#pasteTargetGroup"),
  activationGroup: $("#activationGroup"),
  languageSelect: $("#languageSelect"),
  deviceSelect: $("#deviceSelect"),
  refreshDevices: $("#refreshDevices"),
  maxDuration: $("#maxDuration"),
  maxDurationValue: $("#maxDurationValue"),
  customVocabulary: $("#customVocabulary"),
  vocabularyCount: $("#vocabularyCount"),
  vocabularySaved: $("#vocabularySaved"),
  lastTranscriptCard: $("#lastTranscriptCard"),
  lastTranscriptText: $("#lastTranscriptText"),
  copyLastTranscript: $("#copyLastTranscript"),
  engineSummary: $("#engineSummary"),
  engineState: $("#engineState"),
  engineStateText: $("#engineStateText"),
  engineBackend: $("#engineBackend"),
  engineDevice: $("#engineDevice"),
  engineModel: $("#engineModel"),
  enginePort: $("#enginePort"),
  restartEngine: $("#restartEngine"),
  stopEngine: $("#stopEngine"),
  openLogsButton: $("#openLogsButton"),
  gpuGroup: $("#gpuGroup"),
  openModelsFolder: $("#openModelsFolder"),
  modelList: $("#modelList"),
  customServerPath: $("#customServerPath"),
  customModelPath: $("#customModelPath"),
  customFfmpegPath: $("#customFfmpegPath"),
  applyAdvanced: $("#applyAdvanced"),
  clearAdvanced: $("#clearAdvanced"),
  refreshLog: $("#refreshLog"),
  logView: $("#logView"),
  historyTotal: $("#historyTotal"),
  historyWords: $("#historyWords"),
  historyMinutes: $("#historyMinutes"),
  historySearch: $("#historySearch"),
  clearHistory: $("#clearHistory"),
  historyList: $("#historyList"),
  dropZone: $("#dropZone"),
  chooseFileButton: $("#chooseFileButton"),
  fileSelected: $("#fileSelected"),
  fileName: $("#fileName"),
  filePath: $("#filePath"),
  transcribeFileButton: $("#transcribeFileButton"),
  clearFileButton: $("#clearFileButton"),
  fileProgress: $("#fileProgress"),
  fileProgressBar: $("#fileProgressBar"),
  fileProgressText: $("#fileProgressText"),
  fileProgressTime: $("#fileProgressTime"),
  fileResult: $("#fileResult"),
  fileTranscript: $("#fileTranscript"),
  copyFileText: $("#copyFileText"),
  saveFileText: $("#saveFileText"),
  aboutVersion: $("#aboutVersion"),
  aboutElectron: $("#aboutElectron"),
  aboutPlatform: $("#aboutPlatform"),
  aboutHotkey: $("#aboutHotkey"),
  aboutBackend: $("#aboutBackend"),
  aboutModel: $("#aboutModel"),
  pathList: $("#pathList"),
  openMicSettings: $("#openMicSettings"),
  showWelcome: $("#showWelcome"),
  aboutOpenLogs: $("#aboutOpenLogs"),
  openWhisprSite: $("#openWhisprSite"),
  quitButton: $("#quitButton"),
  quitAppButton: $("#quitAppButton"),
  hotkeyModal: $("#hotkeyModal"),
  closeHotkeyModal: $("#closeHotkeyModal"),
  cancelHotkey: $("#cancelHotkey"),
  saveHotkey: $("#saveHotkey"),
  hotkeyCapture: $("#hotkeyCapture"),
  hotkeyCaptureKeys: $("#hotkeyCaptureKeys"),
  hotkeyCaptureHint: $("#hotkeyCaptureHint"),
  onboardingModal: $("#onboardingModal"),
  onboardingHotkey: $("#onboardingHotkey"),
  onboardingChangeHotkey: $("#onboardingChangeHotkey"),
  finishOnboarding: $("#finishOnboarding"),
  toastStack: $("#toastStack"),
};

let snapshot = null;
let settings = {};
let appState = {};
let engineInfo = null;
let models = [];
let devices = [];
let historyEntries = [];
let activeTab = "dictation";
let onboardingShown = false;
let hotkeyModalOpen = false;
let captureModifiers = [];
let captureMainKey = "";
let pendingHotkey = "";
let saveStatusTimer = null;
let vocabularyTimer = null;
let historySearchTimer = null;
let currentFile = null;
let currentFileText = "";
let fileProgressActive = false;
let fileStageTimer = null;
let refreshDevicesBusy = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character];
  });
}

function icon(name) {
  return `<svg class="icon"><use href="#${name}"></use></svg>`;
}

function basename(filePath) {
  return String(filePath || "").split(/[\\/]/).pop() || "";
}

function truncate(value, max = 80) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function prettyHotkey(hotkey) {
  const labels = {
    Control: "Ctrl",
    Super: "Win",
    Space: "Пробел",
    RightControl: "Правый Ctrl",
    RightAlt: "Правый Alt",
    RightShift: "Правый Shift",
    RightSuper: "Правый Win",
    Escape: "Esc",
    PageUp: "Page Up",
    PageDown: "Page Down",
  };
  const parts = String(hotkey || "")
    .split("+")
    .map((part) => labels[part] || part)
    .filter(Boolean);
  return parts.length ? parts.join(" + ") : "Не задано";
}

function hotkeyKeysHtml(hotkey) {
  const parts = String(hotkey || "")
    .split("+")
    .filter(Boolean);
  if (!parts.length) return '<span class="hotkey-empty">Не задано</span>';
  return parts
    .map((part) => `<kbd>${escapeHtml(prettyHotkey(part))}</kbd>`)
    .join('<span class="key-plus">+</span>');
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value <= 0) return "—";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} ГБ`;
  if (value >= 1024 ** 2) return `${Math.round(value / 1024 ** 2)} МБ`;
  if (value >= 1024) return `${Math.round(value / 1024)} КБ`;
  return `${value} Б`;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Number(ms) || 0) / 1000;
  if (totalSeconds < 10) return `${totalSeconds.toFixed(1)} с`;
  if (totalSeconds < 60) return `${Math.round(totalSeconds)} с`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatMinutes(ms) {
  const minutes = Math.max(0, Number(ms) || 0) / 60000;
  if (minutes >= 10) return String(Math.round(minutes));
  return minutes.toFixed(1).replace(/\.0$/, "");
}

function formatMaxDuration(seconds) {
  const value = Number(seconds) || 300;
  if (value < 60) return `${value} сек`;
  return `${Math.round(value / 60)} мин`;
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Неизвестное время";
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return `Сегодня, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Вчера, ${time}`;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

function backendLabel(backend) {
  if (!backend) return "—";
  if (backend === "cuda") return "CUDA";
  if (backend === "cpu") return "CPU";
  return String(backend).toUpperCase();
}

function phaseInfo(phase) {
  const phases = {
    idle: { label: "Готово", dot: "" },
    starting: { label: "Запуск микрофона", dot: "is-busy" },
    recording: { label: "Слушаю", dot: "is-recording" },
    stopping: { label: "Остановка", dot: "is-busy" },
    transcribing: { label: "Распознавание", dot: "is-busy" },
    pasting: { label: "Вставка", dot: "is-busy" },
    success: { label: "Вставлено", dot: "is-ready" },
    error: { label: "Требует внимания", dot: "is-error" },
  };
  return phases[phase] || phases.idle;
}

function setDot(element, stateClass) {
  if (!element) return;
  element.className = `status-dot${stateClass ? ` ${stateClass}` : ""}`;
}

function setIfIdle(element, value) {
  if (element && document.activeElement !== element) element.value = value;
}

function setChecked(element, value) {
  if (element && element.checked !== !!value) element.checked = !!value;
}

function updatePageHeading() {
  const meta = PAGE_META[activeTab] || PAGE_META.dictation;
  ui.pageTitle.textContent = meta[0];
  ui.pageSubtitle.textContent = meta[1];
}

function renderChrome() {
  ui.versionLabel.textContent = `v${snapshot?.appVersion || "1.0.0"}`;
  ui.hotkeyChipKeys.innerHTML = hotkeyKeysHtml(settings.hotkey);
  ui.heroHotkey.innerHTML = hotkeyKeysHtml(settings.hotkey);
  ui.onboardingHotkey.innerHTML = hotkeyKeysHtml(settings.hotkey);
  ui.heroMode.textContent = settings.activationMode === "push-to-talk" ? "Удерживать для речи" : "Нажатие переключает";
  updatePageHeading();

  const ready = !!engineInfo?.ready;
  const starting = !!engineInfo?.starting;
  const error = engineInfo?.error || appState.engineError;
  if (ready) {
    setDot(ui.engineMiniDot, "is-ready");
    ui.engineMiniTitle.textContent = "Whisper готов";
    ui.engineMiniSub.textContent = `${engineInfo.model || settings.model || "модель"} · ${backendLabel(engineInfo.backend)}`;
  } else if (starting) {
    setDot(ui.engineMiniDot, "is-busy");
    ui.engineMiniTitle.textContent = "Загрузка Whisper";
    ui.engineMiniSub.textContent = "Подготовка локальной модели";
  } else if (error) {
    setDot(ui.engineMiniDot, "is-error");
    ui.engineMiniTitle.textContent = "Ошибка движка";
    ui.engineMiniSub.textContent = truncate(error, 42);
  } else {
    setDot(ui.engineMiniDot, "");
    ui.engineMiniTitle.textContent = "Движок остановлен";
    ui.engineMiniSub.textContent = settings.keepEngineLoaded ? "Запустится при диктовке" : "Загружается по требованию";
  }
}

function renderStatus() {
  const phase = appState.phase || "idle";
  const info = phaseInfo(phase);
  ui.body.dataset.phase = phase;
  ui.statusText.textContent = phase === "success" && appState.message ? appState.message : info.label;
  setDot(ui.statusDot, info.dot);
  ui.statusPill.title = appState.message || info.label;

  const busy = phase === "stopping" || phase === "transcribing" || phase === "pasting";
  const stopping = phase === "recording" || phase === "starting";
  let label = "Начать диктовку";
  if (phase === "starting") label = "Остановить диктовку";
  else if (phase === "recording") label = "Остановить и вставить";
  else if (phase === "stopping") label = "Остановка…";
  else if (phase === "transcribing") label = "Распознавание…";
  else if (phase === "pasting") label = "Вставка…";
  else if (phase === "error") label = "Повторить";

  ui.recordButton.disabled = busy;
  ui.recordButton.classList.toggle("is-recording", stopping);
  ui.recordButtonLabel.textContent = label;
  ui.recordButtonIcon.innerHTML = icon(stopping ? "i-stop" : "i-mic");
}

function selectedDeviceLabel() {
  const selected = devices.find((device) => device.deviceId === settings.deviceId);
  return selected?.label || "Микрофон по умолчанию";
}

function renderDevices() {
  const current = settings.deviceId || "default";
  const seen = new Set();
  const options = [];
  const addOption = (deviceId, label) => {
    const key = String(deviceId || "default");
    if (seen.has(key)) return;
    seen.add(key);
    options.push({ deviceId: key, label: label || "Микрофон" });
  };
  addOption("default", "Микрофон по умолчанию");
  for (const device of devices) {
    addOption(device.deviceId, device.label || "Микрофон");
  }
  if (!seen.has(current)) {
    addOption(current, "Выбранный микрофон (недоступен)");
  }
  ui.deviceSelect.innerHTML = options
    .map((option) => `<option value="${escapeHtml(option.deviceId)}">${escapeHtml(option.label)}</option>`)
    .join("");
  ui.deviceSelect.value = current;
  ui.deviceLabel.textContent = appState.deviceLabel || selectedDeviceLabel();
}

function renderDictation(initial = false) {
  $$("button", ui.pasteTargetGroup).forEach((button) => {
    button.classList.toggle("is-active", button.dataset.value === settings.pasteTarget);
  });
  $$("button", ui.activationGroup).forEach((button) => {
    button.classList.toggle("is-active", button.dataset.value === settings.activationMode);
  });

  setIfIdle(ui.languageSelect, settings.language || "auto");
  renderDevices();
  setIfIdle(ui.maxDuration, String(settings.maxDurationSec || 300));
  ui.maxDurationValue.textContent = formatMaxDuration(settings.maxDurationSec);

  for (const id of TOGGLE_IDS) {
    if (ui[id]) setChecked(ui[id], settings[id]);
  }

  if (document.activeElement !== ui.customVocabulary) {
    ui.customVocabulary.value = settings.customVocabulary || "";
  }
  updateVocabularyCount();
  setLevel(appState.level || 0);

  if (appState.transcript) {
    ui.lastTranscriptCard.hidden = false;
    ui.lastTranscriptText.textContent = appState.transcript;
  } else {
    ui.lastTranscriptCard.hidden = true;
  }

  if (initial) renderDevices();
}

function renderModels(initial = false) {
  const ready = !!engineInfo?.ready;
  const starting = !!engineInfo?.starting;
  const error = engineInfo?.error || appState.engineError;
  const stateLabel = ready ? "Готов" : starting ? "Загрузка" : error ? "Ошибка" : "Остановлен";
  ui.engineStateText.textContent = stateLabel;
  setDot($(".status-dot", ui.engineState), ready ? "is-ready" : starting ? "is-busy" : error ? "is-error" : "");
  ui.engineSummary.textContent = ready
    ? "Whisper готов. Аудио остаётся на этом ПК."
    : starting
      ? "Загрузка локальной модели в память…"
      : error
        ? "Движок остановился с ошибкой. Проверьте лог ниже."
        : "Аудио не покидает ваш компьютер. Движок запускается по необходимости.";
  ui.engineBackend.textContent = backendLabel(engineInfo?.backend);
  ui.engineDevice.textContent = engineInfo?.deviceName || "—";
  ui.engineModel.textContent = engineInfo?.model || settings.model || "—";
  ui.enginePort.textContent = engineInfo?.port || "—";

  $$("button", ui.gpuGroup).forEach((button) => {
    button.classList.toggle("is-active", button.dataset.value === (settings.gpu || "auto"));
  });

  const list = [...models];
  if (settings.customModelPath) {
    const exists = list.some((model) => model.path === settings.customModelPath);
    if (!exists) {
      list.unshift({
        name: basename(settings.customModelPath).replace(/^ggml-/i, "").replace(/\.bin$/i, ""),
        path: settings.customModelPath,
        size: 0,
        source: "custom",
      });
    }
  }
  const selected = settings.customModelPath
    ? engineInfo?.model
    : settings.model || engineInfo?.model;

  if (!list.length) {
    ui.modelList.innerHTML =
      '<div class="empty-inline">Модели не найдены. Откройте папку моделей и добавьте файл ggml-*.bin.</div>';
  } else {
    ui.modelList.innerHTML = list
      .map((model) => {
        const isSelected = model.name === selected || model.path === selected;
        const meta = `${SOURCE_LABELS[model.source] || model.source || "Локальная"} · ${formatBytes(model.size)}`;
        return `<button class="model-card${isSelected ? " is-selected" : ""}" data-model="${escapeHtml(model.name)}" title="${escapeHtml(model.path)}">
          <span class="model-radio"></span>
          <span class="model-copy">
            <span class="model-name">${escapeHtml(model.name)}</span>
            <span class="model-meta">${escapeHtml(meta)}</span>
          </span>
          <span class="model-size">${model.size ? escapeHtml(formatBytes(model.size)) : "своя"}</span>
        </button>`;
      })
      .join("");
  }

  setIfIdle(ui.customServerPath, settings.customServerPath || "");
  setIfIdle(ui.customModelPath, settings.customModelPath || "");
  setIfIdle(ui.customFfmpegPath, settings.customFfmpegPath || "");
}

function renderBanners() {
  const banners = [];
  if (snapshot?.openWhisprRunning) {
    banners.push({
      kind: "warning",
      title: "OpenWhispr запущен",
      text: "Два приложения диктовки могут конфликтовать за одно сочетание клавиш. Закройте OpenWhispr или выберите другое сочетание здесь.",
      action: "hotkey",
      actionLabel: "Изменить клавишу",
    });
  }
  if (appState.hotkeyError) {
    banners.push({
      kind: "error",
      title: "Клавиша недоступна",
      text: appState.hotkeyError,
      action: "hotkey",
      actionLabel: "Выбрать другую",
    });
  } else if (appState.hotkeyWarning) {
    banners.push({
      kind: "warning",
      title: "Клавиша использует резервный обработчик",
      text: appState.hotkeyWarning,
      action: "hotkey",
      actionLabel: "Изменить клавишу",
    });
  }
  const engineError = engineInfo?.error || appState.engineError;
  if (engineError) {
    banners.push({
      kind: "error",
      title: "Проблема с движком Whisper",
      text: truncate(engineError, 220),
      action: "logs",
      actionLabel: "Открыть логи",
    });
  }
  if (!models.length && !settings.customModelPath) {
    banners.push({
      kind: "warning",
      title: "Модель Whisper не найдена",
      text: "Выберите модель ggml-*.bin в разделе «Локальные модели» или установите её через OpenWhispr.",
      action: "models",
      actionLabel: "Открыть модели",
    });
  }
  if (snapshot?.paths && !snapshot.paths.fastPaste) {
    banners.push({
      kind: "warning",
      title: "Помощник вставки не найден",
      text: "Установите OpenWhispr или поместите windows-fast-paste.exe в папку bin. Транскрипции всё равно копируются в буфер обмена.",
      action: "about",
      actionLabel: "Подробнее",
    });
  }

  ui.bannerStack.innerHTML = banners
    .map(
      (banner) => `<div class="banner is-${banner.kind}">
        <span class="banner-icon">${icon(banner.kind === "error" ? "i-warning" : "i-info")}</span>
        <div class="banner-body"><strong>${escapeHtml(banner.title)}</strong><span>${escapeHtml(banner.text)}</span></div>
        <button class="banner-action" data-banner-action="${banner.action}">${escapeHtml(banner.actionLabel)}</button>
      </div>`
    )
    .join("");
}

function renderHistory() {
  const totalMs = historyEntries.reduce((sum, entry) => sum + (Number(entry.durationMs) || 0), 0);
  const totalWords = historyEntries.reduce(
    (sum, entry) => sum + String(entry.text || "").trim().split(/\s+/).filter(Boolean).length,
    0
  );
  ui.historyTotal.textContent = String(historyEntries.length);
  ui.historyWords.textContent = String(totalWords);
  ui.historyMinutes.textContent = formatMinutes(totalMs);

  const query = String(ui.historySearch.value || "").trim().toLowerCase();
  const filtered = query
    ? historyEntries.filter((entry) => String(entry.text || "").toLowerCase().includes(query))
    : historyEntries;

  if (!filtered.length) {
    const emptyTitle = query ? "Ничего не найдено" : "Транскрипций пока нет";
    const emptyText = query
      ? "Попробуйте другое слово или очистите поиск, чтобы увидеть всё."
      : "Нажмите горячую клавишу и говорите. Транскрипция появится здесь и будет готова к повторному использованию.";
    const action = query
      ? '<button class="button ghost" data-empty-action="clear-search">Очистить поиск</button>'
      : '<button class="button primary" data-empty-action="start">Начать диктовку</button>';
    ui.historyList.innerHTML = `<div class="empty-state">
      <span class="empty-icon">${icon("i-history")}</span>
      <h3>${emptyTitle}</h3>
      <p>${emptyText}</p>
      ${action}
    </div>`;
    return;
  }

  ui.historyList.innerHTML = filtered
    .map((entry) => {
      const source = entry.source === "file" ? "file" : "dictation";
      const sourceLabel = source === "file" ? "Файл" : "Диктовка";
      const model = entry.model ? `<span class="badge">${escapeHtml(entry.model)}</span>` : "";
      return `<article class="history-item" data-id="${escapeHtml(entry.id)}">
        <div class="history-main">
          <div class="history-meta">
            <span class="history-time">${escapeHtml(formatDate(entry.createdAt))}</span>
            <span class="badge ${source}">${sourceLabel}</span>
            ${model}
            <span>${escapeHtml(formatDuration(entry.durationMs))}</span>
          </div>
          <p class="history-text">${escapeHtml(entry.text)}</p>
        </div>
        <div class="history-actions">
          <button class="icon-button" data-history-action="copy" title="Копировать транскрипцию" aria-label="Копировать транскрипцию">${icon("i-copy")}</button>
          <button class="icon-button" data-history-action="save" title="Сохранить транскрипцию" aria-label="Сохранить транскрипцию">${icon("i-save")}</button>
          <button class="icon-button" data-history-action="delete" title="Удалить запись" aria-label="Удалить запись">${icon("i-trash")}</button>
        </div>
      </article>`;
    })
    .join("");
}

function renderAbout() {
  ui.aboutVersion.textContent = snapshot?.appVersion || "—";
  ui.aboutElectron.textContent = snapshot?.electronVersion || "—";
  ui.aboutPlatform.textContent = snapshot?.platform === "win32" ? "Windows" : snapshot?.platform || "—";
  ui.aboutHotkey.textContent = prettyHotkey(settings.hotkey);
  ui.aboutBackend.textContent = backendLabel(engineInfo?.backend);
  ui.aboutModel.textContent = engineInfo?.model || settings.model || "—";

  const paths = snapshot?.paths || {};
  const server = Array.isArray(paths.servers) ? paths.servers[0] : null;
  const rows = [
    { label: "Данные приложения", value: paths.userData, open: true },
    { label: "Модели", value: paths.modelsDirs?.[0], open: true },
    { label: "Файл лога", value: paths.logPath, open: true },
    { label: "Быстрая вставка", value: paths.fastPaste },
    { label: "Обработчик клавиш", value: paths.keyListener },
    { label: "FFmpeg", value: paths.ffmpeg },
    { label: "Модель VAD", value: paths.vadModel },
    { label: "whisper-server", value: server?.binary || null },
  ];
  ui.pathList.innerHTML = rows
    .map((row) => {
      const value = row.value || "Не найдено";
      const openButton =
        row.open && row.value
          ? `<button class="icon-button" data-open-path="${escapeHtml(row.value)}" title="Открыть" aria-label="Открыть ${escapeHtml(row.label)}">${icon("i-folder")}</button>`
          : "";
      return `<div class="path-row"><span>${escapeHtml(row.label)}</span><code title="${escapeHtml(value)}">${escapeHtml(value)}</code>${openButton}</div>`;
    })
    .join("");
}

function renderAll(initial = false) {
  renderChrome();
  renderStatus();
  renderDictation(initial);
  renderModels(initial);
  renderHistory();
  renderAbout();
  renderBanners();
}

function applySnapshot(next, initial = false) {
  snapshot = next || {};
  settings = snapshot.settings || {};
  appState = snapshot.state || {};
  engineInfo = snapshot.engine || null;
  models = Array.isArray(snapshot.models) ? snapshot.models : [];
  if (Array.isArray(snapshot.devices) && snapshot.devices.length) {
    devices = snapshot.devices;
  }
  if (!String(ui.historySearch.value || "").trim()) {
    historyEntries = Array.isArray(snapshot.history) ? snapshot.history : [];
  }
  renderAll(initial);
  if (snapshot.firstRun && !onboardingShown) showOnboarding();
}

function setTab(tab) {
  if (!PAGE_META[tab]) return;
  activeTab = tab;
  ui.navItems.forEach((item) => item.classList.toggle("is-active", item.dataset.tab === tab));
  ui.panels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === tab));
  updatePageHeading();
  ui.content.scrollTop = 0;
  if (tab === "models") loadLog();
  if (tab === "history") renderHistory();
  if (tab === "about") renderAbout();
}

function flashSaved() {
  ui.saveStatus.classList.add("is-visible");
  clearTimeout(saveStatusTimer);
  saveStatusTimer = setTimeout(() => ui.saveStatus.classList.remove("is-visible"), 1500);
}

async function updateSetting(partial, options = {}) {
  try {
    const result = await api.updateSettings(partial);
    if (!result || result.ok === false) {
      if (result?.settings) settings = result.settings;
      renderAll(false);
      showToast(result?.error || "Не удалось сохранить настройки.", "error");
      return result;
    }
    if (result.settings) settings = result.settings;
    flashSaved();
    if (options.toast) showToast(options.toast, "success");
    return result;
  } catch (error) {
    showToast(error?.message || "Не удалось сохранить настройки.", "error");
    return null;
  }
}

function showToast(message, kind = "info") {
  if (!message) return;
  const toast = document.createElement("div");
  toast.className = `toast ${kind}`;
  const iconName = kind === "error" ? "i-warning" : kind === "success" ? "i-check" : "i-info";
  toast.innerHTML = `${icon(iconName)}<span></span>`;
  $("span", toast).textContent = message;
  while (ui.toastStack.children.length >= 4) {
    ui.toastStack.firstElementChild?.remove();
  }
  ui.toastStack.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(10px)";
    setTimeout(() => toast.remove(), 180);
  }, 4200);
}

function setLevel(level) {
  const clamped = Math.max(0, Math.min(1, Number(level) || 0));
  ui.levelBar.style.width = `${Math.round(clamped * 100)}%`;
}

function updateVocabularyCount() {
  const length = ui.customVocabulary.value.length;
  ui.vocabularyCount.textContent = `${length} / 8000`;
}

function setLastTranscript(text) {
  if (!text) return;
  ui.lastTranscriptCard.hidden = false;
  ui.lastTranscriptText.textContent = text;
}

async function copyToClipboard(text, message = "Скопировано в буфер обмена.") {
  if (!text) return;
  try {
    await api.copyText(text);
    showToast(message, "success");
  } catch {
    showToast("Не удалось скопировать в буфер обмена.", "error");
  }
}

async function saveTranscript(text, defaultName) {
  if (!text) return;
  try {
    const result = await api.saveText({ text, defaultName });
    if (result?.ok) showToast(`Сохранено в ${result.path}`, "success");
  } catch {
    showToast("Не удалось сохранить транскрипцию.", "error");
  }
}

async function handleRecordClick() {
  const phase = appState.phase || "idle";
  if (phase === "stopping" || phase === "transcribing" || phase === "pasting") return;
  const stopping = phase === "recording" || phase === "starting";
  try {
    const result = stopping ? await api.stopDictation() : await api.startDictation();
    if (result?.ok === false) {
      if (!["busy", "starting", "not_recording", "start_failed", "cancelled"].includes(result.error)) {
        showToast(result.error, "error");
      }
      return;
    }
    if (result?.ok && result.text) {
      setLastTranscript(result.text);
      showToast("Вставлено в активное приложение.", "success");
    }
  } catch (error) {
    showToast(error?.message || "Не удалось выполнить диктовку.", "error");
  }
}

async function refreshDevices() {
  if (refreshDevicesBusy) return;
  refreshDevicesBusy = true;
  ui.refreshDevices.disabled = true;
  try {
    const list = await api.getDevices();
    if (Array.isArray(list)) {
      devices = list;
      renderDevices();
      showToast(list.length ? "Список микрофонов обновлён." : "Микрофоны не найдены.", list.length ? "success" : "error");
    }
  } catch {
    showToast("Не удалось получить список микрофонов.", "error");
  } finally {
    refreshDevicesBusy = false;
    ui.refreshDevices.disabled = false;
  }
}

function updateMaxDurationLabel() {
  ui.maxDurationValue.textContent = formatMaxDuration(ui.maxDuration.value);
}

function onVocabularyInput() {
  updateVocabularyCount();
  ui.vocabularySaved.textContent = "Сохранение…";
  clearTimeout(vocabularyTimer);
  vocabularyTimer = setTimeout(async () => {
    const result = await updateSetting({ customVocabulary: ui.customVocabulary.value });
    if (result?.ok === false) {
      ui.vocabularySaved.textContent = "Не сохранено";
    } else {
      ui.vocabularySaved.textContent = "Сохранено";
      setTimeout(() => {
        if (ui.vocabularySaved.textContent === "Сохранено") {
          ui.vocabularySaved.textContent = "Изменения сохраняются автоматически";
        }
      }, 1400);
    }
  }, 550);
}

function openHotkeyModal() {
  if (hotkeyModalOpen) return;
  hotkeyModalOpen = true;
  pendingHotkey = "";
  captureModifiers = [];
  captureMainKey = "";
  ui.hotkeyModal.hidden = false;
  ui.hotkeyCapture.classList.add("is-listening");
  ui.hotkeyCaptureKeys.innerHTML = '<span class="capture-placeholder">Нажмите сочетание</span>';
  ui.hotkeyCaptureHint.textContent = "Esc — отмена";
  ui.saveHotkey.disabled = true;
  ui.saveHotkey.textContent = "Сохранить клавишу";
  api.suspendHotkeys().catch(() => {});
  setTimeout(() => ui.hotkeyCapture.focus(), 60);
}

function closeHotkeyModal() {
  if (!hotkeyModalOpen) return;
  hotkeyModalOpen = false;
  ui.hotkeyModal.hidden = true;
  ui.hotkeyCapture.classList.remove("is-listening");
  pendingHotkey = "";
  captureModifiers = [];
  captureMainKey = "";
  api.resumeHotkeys().catch(() => {});
  ui.hotkeyChip.focus();
}

function rightModifierForCode(code) {
  const map = {
    ControlRight: "RightControl",
    AltRight: "RightAlt",
    ShiftRight: "RightShift",
    MetaRight: "RightSuper",
  };
  return map[code] || "";
}

function isModifierCode(code) {
  return /^(Control|Alt|Shift|Meta)(Left|Right)$/.test(code);
}

function keyFromEvent(event) {
  const code = event.code || "";
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
  const map = {
    Space: "Space",
    Escape: "Escape",
    Tab: "Tab",
    Enter: "Enter",
    Backspace: "Backspace",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    CapsLock: "CapsLock",
    NumLock: "NumLock",
    ScrollLock: "ScrollLock",
    Pause: "Pause",
    PrintScreen: "PrintScreen",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
  };
  return map[code] || "";
}

function buildHotkeyString(modifiers, mainKey) {
  const order = ["Control", "Alt", "Shift", "Super"];
  const parts = order.filter((modifier) => modifiers.includes(modifier));
  if (mainKey) parts.push(mainKey);
  return parts.join("+");
}

function isCaptureValid() {
  if (!pendingHotkey) return false;
  const isFunctionKey = /^F([1-9]|1\d|2[0-4])$/.test(captureMainKey);
  const isRightModifier = /^Right(Control|Alt|Shift|Super)$/.test(captureMainKey);
  if (!captureMainKey) return captureModifiers.length >= 2;
  if (isFunctionKey || isRightModifier) return true;
  return captureModifiers.length > 0;
}

function renderCapture() {
  ui.hotkeyCaptureKeys.innerHTML = pendingHotkey
    ? hotkeyKeysHtml(pendingHotkey)
    : '<span class="capture-placeholder">Нажмите сочетание</span>';
  if (!pendingHotkey) {
    ui.hotkeyCaptureHint.textContent = "Esc — отмена";
  } else if (isCaptureValid()) {
    ui.hotkeyCaptureHint.textContent = "Всё верно. Нажмите «Сохранить клавишу».";
  } else if (!captureMainKey) {
    ui.hotkeyCaptureHint.textContent = "Добавьте основную клавишу или нажмите правый модификатор отдельно.";
  } else {
    ui.hotkeyCaptureHint.textContent = "Добавьте модификатор или используйте F-клавишу отдельно.";
  }
  ui.saveHotkey.disabled = !isCaptureValid();
}

function onCaptureKeyDown(event) {
  if (!hotkeyModalOpen) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.repeat) return;
  if (event.key === "Escape") {
    closeHotkeyModal();
    return;
  }

  let modifiers = [];
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Super");

  const code = event.code || "";
  const rightModifier = rightModifierForCode(code);
  let mainKey = "";
  if (rightModifier) {
    const generic = {
      RightControl: "Control",
      RightAlt: "Alt",
      RightShift: "Shift",
      RightSuper: "Super",
    }[rightModifier];
    modifiers = modifiers.filter((modifier) => modifier !== generic);
    mainKey = rightModifier;
  } else if (!isModifierCode(code)) {
    mainKey = keyFromEvent(event);
  }

  if (!mainKey && !modifiers.length) return;
  captureModifiers = modifiers;
  captureMainKey = mainKey;
  pendingHotkey = buildHotkeyString(modifiers, mainKey);
  renderCapture();
}

async function saveHotkeyFromModal() {
  if (!pendingHotkey || !isCaptureValid()) return;
  ui.saveHotkey.disabled = true;
  ui.saveHotkey.textContent = "Сохранение…";
  const result = await updateSetting({ hotkey: pendingHotkey });
  ui.saveHotkey.textContent = "Сохранить клавишу";
  if (result?.ok === false) {
    ui.saveHotkey.disabled = false;
    api.suspendHotkeys().catch(() => {});
    return;
  }
  const saved = pendingHotkey;
  closeHotkeyModal();
  showToast(`Горячая клавиша: ${prettyHotkey(saved)}.`, "success");
}

function showOnboarding(force = false) {
  if (onboardingShown && !force) return;
  onboardingShown = true;
  ui.onboardingModal.hidden = false;
  ui.onboardingHotkey.innerHTML = hotkeyKeysHtml(settings.hotkey);
  setTimeout(() => ui.finishOnboarding.focus(), 60);
}

function hideOnboarding() {
  ui.onboardingModal.hidden = true;
}

async function finishOnboarding() {
  hideOnboarding();
  try {
    await api.setOnboarded();
  } catch {
    // The welcome screen can be shown again from About.
  }
}

async function onboardingChangeHotkey() {
  await finishOnboarding();
  openHotkeyModal();
}

async function loadLog() {
  try {
    const text = await api.getLog();
    ui.logView.textContent = text || "Записей в логе пока нет.";
    ui.logView.scrollTop = ui.logView.scrollHeight;
  } catch {
    ui.logView.textContent = "Не удалось прочитать лог.";
  }
}

function selectFile(filePath) {
  if (!filePath) return;
  currentFile = filePath;
  currentFileText = "";
  ui.fileName.textContent = basename(filePath);
  ui.filePath.textContent = filePath;
  ui.filePath.title = filePath;
  ui.dropZone.hidden = true;
  ui.fileSelected.hidden = false;
  ui.fileResult.hidden = true;
  ui.fileProgress.hidden = true;
  ui.fileTranscript.value = "";
  ui.transcribeFileButton.disabled = false;
}

function clearFile() {
  currentFile = null;
  currentFileText = "";
  fileProgressActive = false;
  clearTimeout(fileStageTimer);
  ui.dropZone.hidden = false;
  ui.fileSelected.hidden = true;
  ui.fileResult.hidden = true;
  ui.fileProgress.hidden = true;
  ui.fileTranscript.value = "";
  ui.transcribeFileButton.disabled = false;
}

async function chooseFile() {
  try {
    const filePath = await api.chooseFile();
    if (filePath) selectFile(filePath);
  } catch {
    showToast("Не удалось открыть выбор файла.", "error");
  }
}

async function transcribeFile() {
  if (!currentFile) return;
  ui.transcribeFileButton.disabled = true;
  ui.fileResult.hidden = true;
  ui.fileProgress.hidden = false;
  ui.fileProgress.classList.add("is-indeterminate");
  ui.fileProgressBar.style.width = "0%";
  ui.fileProgressText.textContent = "Извлечение аудио…";
  ui.fileProgressTime.textContent = "";
  fileProgressActive = true;
  clearTimeout(fileStageTimer);
  fileStageTimer = setTimeout(() => {
    if (fileProgressActive) ui.fileProgressText.textContent = "Распознавание через Whisper…";
  }, 1400);

  try {
    const result = await api.transcribeFile(currentFile);
    if (result?.ok && result.text) {
      currentFileText = result.text;
      ui.fileTranscript.value = result.text;
      ui.fileResult.hidden = false;
      showToast("Файл распознан.", "success");
    } else if (result?.error) {
      showToast(result.error, "error");
    }
  } catch (error) {
    showToast(error?.message || "Не удалось распознать файл.", "error");
  } finally {
    fileProgressActive = false;
    clearTimeout(fileStageTimer);
    ui.fileProgress.hidden = true;
    ui.transcribeFileButton.disabled = false;
  }
}

function updateFileProgress(progress) {
  if (!fileProgressActive) return;
  const seconds = Number(progress?.seconds);
  if (Number.isFinite(seconds) && seconds > 0) {
    ui.fileProgressTime.textContent = `Обработано: ${formatDuration(seconds * 1000)}`;
  }
}

async function browsePath(kind) {
  const options = {
    server: {
      title: "Выберите whisper-server",
      filters: [{ name: "Исполняемый файл", extensions: ["exe"] }, { name: "Все файлы", extensions: ["*"] }],
    },
    model: {
      title: "Выберите модель Whisper",
      filters: [{ name: "Модель Whisper", extensions: ["bin"] }, { name: "Все файлы", extensions: ["*"] }],
    },
    ffmpeg: {
      title: "Выберите FFmpeg",
      filters: [{ name: "Исполняемый файл", extensions: ["exe"] }, { name: "Все файлы", extensions: ["*"] }],
    },
  };
  try {
    const filePath = await api.choosePath(options[kind]);
    if (!filePath) return;
    if (kind === "server") ui.customServerPath.value = filePath;
    if (kind === "model") ui.customModelPath.value = filePath;
    if (kind === "ffmpeg") ui.customFfmpegPath.value = filePath;
    showToast("Путь выбран. Нажмите «Применить пути».", "info");
  } catch {
    showToast("Не удалось открыть выбор файла.", "error");
  }
}

async function applyAdvancedPaths() {
  const result = await updateSetting({
    customServerPath: ui.customServerPath.value.trim(),
    customModelPath: ui.customModelPath.value.trim(),
    customFfmpegPath: ui.customFfmpegPath.value.trim(),
  });
  if (result?.ok !== false) showToast("Пути сохранены. При необходимости движок перезапустится.", "success");
}

async function clearAdvancedPaths() {
  ui.customServerPath.value = "";
  ui.customModelPath.value = "";
  ui.customFfmpegPath.value = "";
  const result = await updateSetting({
    customServerPath: "",
    customModelPath: "",
    customFfmpegPath: "",
  });
  if (result?.ok !== false) showToast("Дополнительные пути очищены.", "success");
}

async function searchHistory(query) {
  const normalized = String(query || "").trim();
  if (!normalized) {
    historyEntries = Array.isArray(snapshot?.history) ? snapshot.history : [];
    renderHistory();
    return;
  }
  try {
    const results = await api.getHistory(normalized);
    historyEntries = Array.isArray(results) ? results : [];
    renderHistory();
  } catch {
    showToast("Не удалось выполнить поиск по истории.", "error");
  }
}

async function deleteHistoryEntry(id) {
  try {
    await api.deleteHistory(id);
    historyEntries = historyEntries.filter((entry) => entry.id !== id);
    if (snapshot?.history) snapshot.history = snapshot.history.filter((entry) => entry.id !== id);
    renderHistory();
    showToast("Запись удалена.", "success");
  } catch {
    showToast("Не удалось удалить запись.", "error");
  }
}

async function clearHistoryEntries() {
  if (!historyEntries.length) return;
  if (!window.confirm("Удалить все транскрипции? Это действие нельзя отменить.")) return;
  try {
    await api.clearHistory();
    historyEntries = [];
    if (snapshot) snapshot.history = [];
    renderHistory();
    showToast("История очищена.", "success");
  } catch {
    showToast("Не удалось очистить историю.", "error");
  }
}

function bindEvents() {
  ui.navItems.forEach((item) => item.addEventListener("click", () => setTab(item.dataset.tab)));
  ui.hotkeyChip.addEventListener("click", openHotkeyModal);
  ui.changeHotkeyButton.addEventListener("click", openHotkeyModal);
  ui.recordButton.addEventListener("click", handleRecordClick);
  ui.refreshDevices.addEventListener("click", refreshDevices);

  ui.pasteTargetGroup.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (button) updateSetting({ pasteTarget: button.dataset.value });
  });
  ui.activationGroup.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (button) updateSetting({ activationMode: button.dataset.value });
  });
  ui.gpuGroup.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (button) updateSetting({ gpu: button.dataset.value });
  });
  ui.languageSelect.addEventListener("change", () => updateSetting({ language: ui.languageSelect.value }));
  ui.deviceSelect.addEventListener("change", () => updateSetting({ deviceId: ui.deviceSelect.value }));
  ui.maxDuration.addEventListener("input", updateMaxDurationLabel);
  ui.maxDuration.addEventListener("change", () =>
    updateSetting({ maxDurationSec: Number(ui.maxDuration.value) })
  );

  for (const id of TOGGLE_IDS) {
    ui[id]?.addEventListener("change", () => updateSetting({ [id]: ui[id].checked }));
  }

  ui.customVocabulary.addEventListener("input", onVocabularyInput);
  ui.copyLastTranscript.addEventListener("click", () => copyToClipboard(ui.lastTranscriptText.textContent));
  ui.modelList.addEventListener("click", (event) => {
    const card = event.target.closest("[data-model]");
    if (!card) return;
    updateSetting({ model: card.dataset.model }, { toast: `Выбрана модель ${card.dataset.model}.` });
  });

  ui.openModelsFolder.addEventListener("click", () => api.openModelsFolder());
  ui.restartEngine.addEventListener("click", async () => {
    ui.restartEngine.disabled = true;
    const result = await api.restartEngine();
    ui.restartEngine.disabled = false;
    if (result?.ok) showToast("Движок Whisper перезапущен.", "success");
    else showToast(result?.error || "Не удалось перезапустить движок.", "error");
  });
  ui.stopEngine.addEventListener("click", async () => {
    const result = await api.stopEngine();
    if (result?.ok) showToast("Движок Whisper остановлен.", "info");
  });
  ui.openLogsButton.addEventListener("click", () => api.openLogs());
  ui.refreshLog.addEventListener("click", loadLog);

  $$("[data-browse]").forEach((button) =>
    button.addEventListener("click", () => browsePath(button.dataset.browse))
  );
  ui.applyAdvanced.addEventListener("click", applyAdvancedPaths);
  ui.clearAdvanced.addEventListener("click", clearAdvancedPaths);

  ui.historySearch.addEventListener("input", () => {
    clearTimeout(historySearchTimer);
    historySearchTimer = setTimeout(() => searchHistory(ui.historySearch.value), 250);
  });
  ui.clearHistory.addEventListener("click", clearHistoryEntries);
  ui.historyList.addEventListener("click", (event) => {
    const emptyAction = event.target.closest("[data-empty-action]");
    if (emptyAction) {
      if (emptyAction.dataset.emptyAction === "clear-search") {
        ui.historySearch.value = "";
        searchHistory("");
      } else {
        handleRecordClick();
      }
      return;
    }
    const actionButton = event.target.closest("[data-history-action]");
    if (!actionButton) return;
    const item = actionButton.closest("[data-id]");
    const entry = historyEntries.find((candidate) => candidate.id === item?.dataset.id);
    if (!entry) return;
    const action = actionButton.dataset.historyAction;
    if (action === "copy") copyToClipboard(entry.text, "Транскрипция скопирована.");
    if (action === "save") {
      const stamp = String(entry.createdAt || new Date().toISOString()).slice(0, 10);
      saveTranscript(entry.text, `transcript-${stamp}.txt`);
    }
    if (action === "delete") deleteHistoryEntry(entry.id);
  });

  ui.chooseFileButton.addEventListener("click", chooseFile);
  ui.clearFileButton.addEventListener("click", clearFile);
  ui.transcribeFileButton.addEventListener("click", transcribeFile);
  ui.copyFileText.addEventListener("click", () => copyToClipboard(currentFileText, "Транскрипция файла скопирована."));
  ui.saveFileText.addEventListener("click", () => {
    const name = currentFile ? `${basename(currentFile).replace(/\.[^.]+$/, "")}.txt` : "transcript.txt";
    saveTranscript(currentFileText, name);
  });

  ["dragenter", "dragover"].forEach((type) =>
    ui.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      ui.dropZone.classList.add("is-dragging");
    })
  );
  ["dragleave", "dragend"].forEach((type) =>
    ui.dropZone.addEventListener(type, () => ui.dropZone.classList.remove("is-dragging"))
  );
  ui.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    ui.dropZone.classList.remove("is-dragging");
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const filePath = api.getPathForFile(file);
    if (filePath) selectFile(filePath);
    else showToast("Не удалось прочитать путь к файлу. Используйте «Выбрать файл».", "error");
  });

  ui.bannerStack.addEventListener("click", (event) => {
    const button = event.target.closest("[data-banner-action]");
    if (!button) return;
    const action = button.dataset.bannerAction;
    if (action === "hotkey") openHotkeyModal();
    if (action === "logs") {
      setTab("models");
      loadLog();
      api.openLogs();
    }
    if (action === "models") setTab("models");
    if (action === "about") setTab("about");
  });

  ui.pathList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-open-path]");
    if (!button) return;
    const opened = await api.openPath(button.dataset.openPath);
    if (!opened) showToast("Не удалось открыть этот путь.", "error");
  });

  ui.openMicSettings.addEventListener("click", () => api.openMicSettings());
  ui.showWelcome.addEventListener("click", () => showOnboarding(true));
  ui.aboutOpenLogs.addEventListener("click", () => api.openLogs());
  ui.openWhisprSite.addEventListener("click", () => api.openExternal("https://openwhispr.com"));
  ui.quitButton.addEventListener("click", () => api.quit());
  ui.quitAppButton.addEventListener("click", () => api.quit());

  ui.hotkeyChip.addEventListener("contextmenu", (event) => event.preventDefault());
  ui.closeHotkeyModal.addEventListener("click", closeHotkeyModal);
  ui.cancelHotkey.addEventListener("click", closeHotkeyModal);
  ui.saveHotkey.addEventListener("click", saveHotkeyFromModal);
  ui.hotkeyCapture.addEventListener("click", () => ui.hotkeyCapture.focus());
  ui.hotkeyCapture.addEventListener("keydown", onCaptureKeyDown);
  ui.onboardingChangeHotkey.addEventListener("click", onboardingChangeHotkey);
  ui.finishOnboarding.addEventListener("click", finishOnboarding);

  ui.hotkeyModal.addEventListener("click", (event) => {
    if (event.target === ui.hotkeyModal) closeHotkeyModal();
  });
  ui.onboardingModal.addEventListener("click", (event) => {
    if (event.target === ui.onboardingModal) finishOnboarding();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (hotkeyModalOpen && document.activeElement !== ui.hotkeyCapture) {
      closeHotkeyModal();
    } else if (!ui.onboardingModal.hidden) {
      finishOnboarding();
    }
  });
}

function renderLanguageOptions() {
  ui.languageSelect.innerHTML = LANGUAGES.map(
    ([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`
  ).join("");
}

async function init() {
  renderLanguageOptions();
  bindEvents();
  try {
    const data = await api.getState();
    applySnapshot(data, true);
    setTab(activeTab);
  } catch (error) {
    showToast(error?.message || "Не удалось загрузить настройки.", "error");
  }

  api.onState((next) => applySnapshot(next));
  api.onToast((payload) => showToast(payload?.message, payload?.kind));
  api.onTab((tab) => setTab(tab));
  api.onLevel((payload) => setLevel(payload?.level));
  api.onFileProgress((progress) => updateFileProgress(progress));

  try {
    const list = await api.getDevices();
    if (Array.isArray(list) && list.length) {
      devices = list;
      renderDevices();
    }
  } catch {
    // The recorder may still be warming up.
  }
  loadLog();
}

init().catch((error) => {
  console.error(error);
  showToast("TranscribeBro не удалось инициализировать окно настроек.", "error");
});
