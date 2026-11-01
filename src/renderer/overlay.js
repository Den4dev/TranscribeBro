const overlay = document.getElementById("overlay");
const eyebrow = document.getElementById("eyebrow");
const timer = document.getElementById("timer");
const title = document.getElementById("title");
const message = document.getElementById("message");
const enginePill = document.getElementById("enginePill");
const barsEl = document.getElementById("bars");
const orbIcon = document.getElementById("orbIcon");
const orbUse = orbIcon ? orbIcon.querySelector("use") : null;
const resultUse = document.getElementById("resultUse");
const footerKey = document.getElementById("hotkeyHint");
const footerLabel = document.getElementById("hotkeyAction");

const BAR_COUNT = 17;
const bars = [];
let current = null;
let level = 0;
let targetLevel = 0;
let animationFrame = 0;
let lastPhase = "";
let lastTimerText = "";

for (let index = 0; index < BAR_COUNT; index += 1) {
  const bar = document.createElement("span");
  bar.className = "bar";
  barsEl.appendChild(bar);
  bars.push(bar);
}

const PHASES = {
  starting: {
    eyebrow: "ЗАПУСК",
    title: "Подготовка",
    message: "Подключение к микрофону…",
    icon: "#o-mic",
    footerKey: "подождите",
    footerLabel: "мгновение",
  },
  recording: {
    eyebrow: "ЗАПИСЬ",
    title: "Слушаю",
    message: "Говорите естественно — текст появится там, где вы печатаете.",
    icon: "#o-mic",
    footerKey: null,
    footerLabel: "чтобы остановить",
  },
  stopping: {
    eyebrow: "ОСТАНОВКА",
    title: "Завершаю",
    message: "Сохраняю последние слова…",
    icon: "#o-mic",
    footerKey: "подождите",
    footerLabel: "мгновение",
  },
  transcribing: {
    eyebrow: "РАСПОЗНАВАНИЕ",
    title: "Работает локально",
    message: "Whisper превращает речь в текст.",
    icon: "#o-wave",
    footerKey: "приватно",
    footerLabel: "работает на этом ПК",
  },
  pasting: {
    eyebrow: "ВСТАВКА",
    title: "Добавляю в приложение",
    message: "Вставляю в активное окно…",
    icon: "#o-wave",
    footerKey: "почти",
    footerLabel: "готово",
  },
  success: {
    eyebrow: "ГОТОВО",
    title: "Вставлено",
    message: "Транскрипция готова.",
    icon: "#o-check",
    footerKey: "Ctrl + Z",
    footerLabel: "чтобы отменить",
  },
  error: {
    eyebrow: "ТРЕБУЕТ ВНИМАНИЯ",
    title: "Не удалось завершить",
    message: "Что-то пошло не так. Попробуйте ещё раз.",
    icon: "#o-warning",
    footerKey: null,
    footerLabel: "чтобы повторить",
  },
};

function setText(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function prettyHotkey(value) {
  const names = {
    control: "Ctrl",
    ctrl: "Ctrl",
    super: "Win",
    meta: "Win",
    command: "Cmd",
    cmd: "Cmd",
    alt: "Alt",
    option: "Alt",
    shift: "Shift",
    space: "Пробел",
    rightcontrol: "Правый Ctrl",
    leftcontrol: "Левый Ctrl",
    rightsuper: "Правый Win",
    leftsuper: "Левый Win",
    rightalt: "Правый Alt",
    leftalt: "Левый Alt",
  };
  return String(value || "Control+Super")
    .split("+")
    .map((part) => names[part.trim().toLowerCase()] || part.trim())
    .filter(Boolean)
    .join(" + ");
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function elapsedMs() {
  if (!current) return 0;
  if (current.phase === "recording" && current.startedAt) {
    return Date.now() - current.startedAt;
  }
  if (current.durationMs) return current.durationMs;
  if (current.startedAt) return Date.now() - current.startedAt;
  return 0;
}

function updateTimer() {
  const text = formatDuration(elapsedMs());
  if (text !== lastTimerText) {
    lastTimerText = text;
    timer.textContent = text;
  }
}

function updateEnginePill(state) {
  const model = state.model ? String(state.model) : "";
  const backend = state.backend ? String(state.backend).toUpperCase() : "";
  if (!model && !backend) {
    enginePill.hidden = true;
    return;
  }
  enginePill.hidden = false;
  setText(enginePill, [model, backend].filter(Boolean).join(" · "));
}

function updateFooter(phase, state) {
  const config = PHASES[phase] || PHASES.starting;
  const hotkey = prettyHotkey(state.hotkey);
  footerKey.textContent = config.footerKey || hotkey;
  footerLabel.textContent = config.footerLabel;
}

function updateContent(state, phase) {
  const config = PHASES[phase];
  if (!config) return;
  const isRecording = phase === "recording";
  const isError = phase === "error";
  const isSuccess = phase === "success";

  setText(eyebrow, config.eyebrow);
  setText(title, isSuccess && state.message ? state.message : config.title);

  let detail = config.message;
  if (isRecording && state.deviceLabel) {
    detail = `${state.deviceLabel} · говорите естественно`;
  } else if (isSuccess && state.transcript) {
    detail = String(state.transcript).replace(/\s+/g, " ").trim();
  } else if (isError) {
    detail = state.error || state.message || config.message;
  }
  setText(message, detail);

  const icon = isError ? "#o-warning" : isSuccess ? "#o-check" : config.icon;
  if (orbUse) orbUse.setAttribute("href", icon);
  resultUse.setAttribute("href", isError ? "#o-warning" : "#o-check");
}

function startBars() {
  if (animationFrame) return;
  const render = (now) => {
    animationFrame = requestAnimationFrame(render);
    level += (targetLevel - level) * 0.22;
    const energy = Math.max(0.025, Math.min(1, level));
    for (let index = 0; index < bars.length; index += 1) {
      const wave = 0.5 + 0.5 * Math.sin(now / 190 + index * 0.82);
      const pulse = 0.72 + 0.28 * Math.sin(now / 125 + index * 0.31);
      const height = 0.07 + energy * (0.3 + 0.7 * wave) * pulse;
      bars[index].style.transform = `scaleY(${Math.min(1, height).toFixed(3)})`;
    }
  };
  animationFrame = requestAnimationFrame(render);
}

function stopBars() {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }
  for (const bar of bars) bar.style.transform = "scaleY(0.08)";
}

function applyState(next) {
  if (!next) return;
  current = next;
  const phase = PHASES[next.phase] ? next.phase : "idle";
  overlay.dataset.phase = phase;
  overlay.classList.toggle("is-visible", phase !== "idle");

  updateTimer();
  updateEnginePill(next);

  if (phase === "idle") {
    stopBars();
    lastPhase = phase;
    return;
  }

  updateContent(next, phase);
  updateFooter(phase, next);

  if (phase === "recording") {
    targetLevel = Number(next.level) || 0;
    startBars();
  } else {
    stopBars();
    targetLevel = 0;
    level = 0;
  }

  if (lastPhase !== phase) {
    lastPhase = phase;
    overlay.classList.remove("phase-enter");
    void overlay.offsetWidth;
    overlay.classList.add("phase-enter");
  }
}

if (window.overlayApi) {
  window.overlayApi.onState(applyState);
  window.overlayApi.getState().then(applyState).catch(() => {});
}

setInterval(updateTimer, 200);
