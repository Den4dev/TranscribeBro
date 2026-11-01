// Загрузка движка Whisper и моделей внутри приложения: пользователю не нужно
// ничего ставить руками — движок берётся из официального релиза whisper.cpp,
// модели — с Hugging Face.
const { execFile } = require("child_process");
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");

const WHISPER_RELEASE_TAG = "b5454";
const RELEASE_BASE = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_RELEASE_TAG}`;
const HF_BASE = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

const ENGINE_BUILDS = [
  {
    id: "cpu",
    label: "CPU (обычный ПК)",
    description: "Работает без видеокарты. Быстрые инструкции CPU подбираются автоматически.",
    url: `${RELEASE_BASE}/whisper-bin-x64.zip`,
    size: 8928640,
  },
  {
    id: "cuda",
    label: "CUDA (видеокарта NVIDIA)",
    description: "Заметно быстрее на больших моделях. Требует NVIDIA GPU и драйвер с CUDA 12.4.",
    url: `${RELEASE_BASE}/whisper-bin-win-cuda-12.4.0-x64.zip`,
    size: 684913404,
  },
];

const FFMPEG_BUILD = {
  id: "ffmpeg",
  label: "FFmpeg",
  description: "Нужен для транскрипции аудио- и видеофайлов: извлекает звук из mp4, mkv, mov и других.",
  url: "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
  size: 114768076,
};

const MODEL_CATALOG = [
  {
    id: "medium",
    file: "ggml-medium.bin",
    label: "Whisper Medium",
    description: "Баланс качества и скорости. Рекомендуется по умолчанию, хорошо слышит русский.",
    size: 1533763059,
    recommended: true,
  },
  {
    id: "large-v3-turbo-q5_0",
    file: "ggml-large-v3-turbo-q5_0.bin",
    label: "Large v3 Turbo (квант.)",
    description: "Лучшее качество при почти той же скорости, что Medium. Немного уступает полной версии.",
    size: 574041195,
  },
  {
    id: "large-v3",
    file: "ggml-large-v3.bin",
    label: "Large v3",
    description: "Максимальная точность. Медленная на CPU, нужна видеокарта.",
    size: 3095033483,
  },
  {
    id: "small",
    file: "ggml-small.bin",
    label: "Whisper Small",
    description: "Быстрая, качество заметно ниже на шумном звуке и русском.",
    size: 487601967,
  },
  {
    id: "medium-q5_0",
    file: "ggml-medium-q5_0.bin",
    label: "Whisper Medium (квант.)",
    description: "Та же Medium в 3 раза меньше на диске, качество почти не отличается.",
    size: 539212467,
  },
  {
    id: "base",
    file: "ggml-base.bin",
    label: "Whisper Base",
    description: "Очень быстрая, для черновиков и коротких фраз.",
    size: 147951465,
  },
  {
    id: "tiny",
    file: "ggml-tiny.bin",
    label: "Whisper Tiny",
    description: "Самая лёгкая — удобно для быстрой проверки, что движок работает.",
    size: 77691713,
  },
  {
    id: "medium.en",
    file: "ggml-medium.en.bin",
    label: "Whisper Medium (только английский)",
    description: "Английские модели точнее на английском, но другие языки не распознают.",
    size: 1533774781,
    englishOnly: true,
  },
];

function getEngineDir(userDataDir) {
  return path.join(userDataDir, "bin");
}

function getModelsDir(userDataDir) {
  return path.join(userDataDir, "models");
}

function formatMb(bytes) {
  return `${Math.round((Number(bytes) || 0) / 1048576)} МБ`;
}

// Простой загрузчик: следует редиректам, пишет в .part, умеет отменяться.
function downloadToFile(url, dest, onProgress, shouldAbort) {
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      fs.rm(dest, { force: true }, () => {});
      reject(error);
    };

    function request(currentUrl, redirectsLeft) {
      const req = https.get(
        currentUrl,
        { headers: { "User-Agent": "TranscribeBro", Accept: "*/*" } },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            if (redirectsLeft <= 0) {
              reject(new Error("Слишком много редиректов при скачивании"));
              return;
            }
            const next = new URL(res.headers.location, currentUrl).toString();
            request(next, redirectsLeft - 1);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`Сервер ответил ${res.statusCode} на ${currentUrl}`));
            return;
          }

          const total = Number(res.headers["content-length"] || 0);
          let received = 0;
          let lastTick = Date.now();
          let lastReceived = 0;
          const out = fs.createWriteStream(dest);
          res.on("data", (chunk) => {
            received += chunk.length;
            if (shouldAbort && shouldAbort()) {
              req.destroy(new Error("cancelled"));
              return;
            }
            const now = Date.now();
            if (now - lastTick >= 500 || received === total) {
              const seconds = Math.max(0.001, (now - lastTick) / 1000);
              const speed = (received - lastReceived) / seconds;
              lastTick = now;
              lastReceived = received;
              if (onProgress) {
                onProgress({ received, total, bytesPerSecond: speed, percent: total ? (received / total) * 100 : 0 });
              }
            }
          });
          res.on("error", (error) => {
            out.destroy();
            finish(error.message === "cancelled" ? new Error("cancelled") : error);
          });
          out.on("error", finish);
          out.on("close", () => {
            if (shouldAbort && shouldAbort()) {
              finish(new Error("cancelled"));
              return;
            }
            if (total && received !== total) {
              finish(new Error(`Файл докачался не полностью: ${received} из ${total} байт`));
              return;
            }
            resolve(dest);
          });
          res.pipe(out);
        }
      );
      req.on("error", (error) => {
        finish(error.message === "cancelled" ? new Error("cancelled") : new Error(`Не удалось скачать: ${error.message}`));
      });
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    request(url, 6);
  });
}

function extractArchive(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const script =
    `$ErrorActionPreference='Stop';` +
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Не удалось распаковать архив: ${(stderr || error.message).slice(0, 400)}`));
          return;
        }
        resolve(destDir);
      }
    );
  });
}

function findInTree(root, nameRegExp) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (nameRegExp.test(entry.name)) {
        return full;
      }
    }
  }
  return null;
}

class Downloader {
  constructor(options = {}) {
    this.userDataDir = options.userDataDir;
    this.paths = options.paths;
    this.logger = options.logger;
    this.onProgress = options.onProgress || (() => {});
    this.job = null;
  }

  get engineDir() {
    return getEngineDir(this.userDataDir);
  }

  get modelsDir() {
    return getModelsDir(this.userDataDir);
  }

  installedEngine() {
    try {
      const found = this.paths.resolveWhisperServers().filter((s) => s.dir.toLowerCase() === this.engineDir.toLowerCase());
      if (!found.length) return null;
      const binary = found[0].binary;
      return { binary, kind: found[0].kind, size: fs.statSync(binary).size, mtime: fs.statSync(binary).mtimeMs };
    } catch {
      return null;
    }
  }

  // Движок, найденный в другой программе (OpenWhispr, Program Files): качать не нужно.
  externalEngine() {
    try {
      const found = this.paths.resolveWhisperServers().filter((s) => s.dir.toLowerCase() !== this.engineDir.toLowerCase());
      if (!found.length) return null;
      const { binary, kind, dir } = found[0];
      const label = /open.?whispr/i.test(dir) ? "OpenWhispr" : path.basename(dir);
      return { binary, kind, dir, label };
    } catch {
      return null;
    }
  }

  catalog() {
    const installed = new Map();
    for (const model of this.paths.listModels()) installed.set(model.name.toLowerCase(), model);
    return {
      engineDir: this.engineDir,
      modelsDir: this.modelsDir,
      engine: {
        installed: this.installedEngine(),
        external: this.externalEngine(),
        builds: ENGINE_BUILDS.map((build) => ({
          ...build,
          sizeLabel: formatMb(build.size),
          diskLabel: formatMb(build.size * 2),
        })),
      },
      ffmpeg: (() => {
        const found = this.paths.resolveFfmpeg();
        const ours = found && found.toLowerCase().startsWith(this.engineDir.toLowerCase()) ? found : null;
        return {
          installed: ours,
          availableElsewhere: !!found,
          build: { ...FFMPEG_BUILD, sizeLabel: formatMb(FFMPEG_BUILD.size) },
        };
      })(),
      models: MODEL_CATALOG.map((model) => {
        const local = installed.get(model.id.toLowerCase());
        return {
          ...model,
          sizeLabel: formatMb(model.size),
          installed: local ? { path: local.path, size: local.size, source: local.source } : null,
        };
      }),
      extraModels: this.paths
        .listModels()
        .filter((m) => !MODEL_CATALOG.some((c) => c.id.toLowerCase() === m.name.toLowerCase()))
        .map((m) => ({ ...m, sizeLabel: formatMb(m.size) })),
    };
  }

  _busyError() {
    if (!this.job) return null;
    return new Error(`Уже скачивается ${this.job.label}. Дождитесь окончания или отмените.`);
  }

  cancel() {
    if (!this.job) return { ok: false, reason: "nothing_to_cancel" };
    this.job.aborted = true;
    return { ok: true };
  }

  _start(label, kind) {
    if (this._busyError()) throw this._busyError();
    this.job = { label, kind, aborted: false, startedAt: Date.now() };
    return this.job;
  }

  _finish(job, error) {
    if (this.job === job) this.job = null;
    if (error && this.logger) this.logger.warn("Download failed", { label: job.label, error: error.message });
  }

  async installEngine(buildId) {
    const build = ENGINE_BUILDS.find((b) => b.id === buildId) || ENGINE_BUILDS[0];
    const job = this._start(`Движок ${build.label}`, "engine");
    const tempDir = path.join(os.tmpdir(), "transcribebro-engine");
    const zipPath = path.join(tempDir, `${build.id}.zip`);
    const extractDir = path.join(tempDir, `${build.id}-extracted`);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.mkdirSync(tempDir, { recursive: true });
      await downloadToFile(build.url, zipPath, (p) => this.onProgress({ id: build.id, kind: "engine", stage: "download", ...p }), () => job.aborted);
      this.onProgress({ id: build.id, kind: "engine", stage: "extract", received: build.size, total: build.size, percent: 100 });
      await extractArchive(zipPath, extractDir);
      const server = findInTree(extractDir, /^whisper-server[^\\]*\.exe$/i);
      if (!server) throw new Error("В архиве не найден whisper-server");

      fs.mkdirSync(this.engineDir, { recursive: true });
      // Движок ищется как whisper-server-win32-x64[-cuda].exe — приводим имя к ожидаемому.
      const target = path.join(this.engineDir, build.id === "cuda" ? "whisper-server-win32-x64-cuda.exe" : "whisper-server-win32-x64.exe");
      fs.copyFileSync(server, target);
      let dllCount = 0;
      for (const entry of fs.readdirSync(path.dirname(server))) {
        if (!/\.dll$/i.test(entry)) continue;
        fs.copyFileSync(path.join(path.dirname(server), entry), path.join(this.engineDir, entry));
        dllCount += 1;
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
      if (this.logger) this.logger.info("Whisper engine installed", { build: build.id, target, dllCount });
      return { ok: true, binary: target, dllCount, build: build.id };
    } catch (error) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      throw error.message === "cancelled" ? new Error("Скачивание движка отменено") : error;
    } finally {
      this._finish(job);
    }
  }

  async installFfmpeg() {
    const job = this._start("FFmpeg", "ffmpeg");
    const tempDir = path.join(os.tmpdir(), "transcribebro-ffmpeg");
    const zipPath = path.join(tempDir, "ffmpeg.zip");
    const extractDir = path.join(tempDir, "extracted");
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.mkdirSync(tempDir, { recursive: true });
      await downloadToFile(FFMPEG_BUILD.url, zipPath, (p) => this.onProgress({ id: "ffmpeg", kind: "ffmpeg", stage: "download", ...p }), () => job.aborted);
      this.onProgress({ id: "ffmpeg", kind: "ffmpeg", stage: "extract", received: FFMPEG_BUILD.size, total: FFMPEG_BUILD.size, percent: 100 });
      await extractArchive(zipPath, extractDir);
      const ffmpeg = findInTree(extractDir, /^ffmpeg\.exe$/i);
      if (!ffmpeg) throw new Error("В архиве не найден ffmpeg.exe");
      fs.mkdirSync(this.engineDir, { recursive: true });
      const target = path.join(this.engineDir, "ffmpeg.exe");
      fs.copyFileSync(ffmpeg, target);
      const ffprobe = findInTree(path.dirname(ffmpeg), /^ffprobe\.exe$/i);
      if (ffprobe) fs.copyFileSync(ffprobe, path.join(this.engineDir, "ffprobe.exe"));
      fs.rmSync(tempDir, { recursive: true, force: true });
      if (this.logger) this.logger.info("FFmpeg installed", { target });
      return { ok: true, binary: target };
    } catch (error) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      throw error.message === "cancelled" ? new Error("Скачивание FFmpeg отменено") : error;
    } finally {
      this._finish(job);
    }
  }

  async installModel(modelId) {
    const model = MODEL_CATALOG.find((m) => m.id === modelId);
    if (!model) throw new Error(`Неизвестная модель ${modelId}`);
    const job = this._start(`Модель ${model.label}`, "model");
    const target = path.join(this.modelsDir, model.file);
    const partPath = `${target}.part`;
    try {
      fs.mkdirSync(this.modelsDir, { recursive: true });
      await downloadToFile(`${HF_BASE}/${model.file}`, partPath, (p) => this.onProgress({ id: model.id, kind: "model", stage: "download", ...p }), () => job.aborted);
      fs.renameSync(partPath, target);
      if (this.logger) this.logger.info("Whisper model installed", { model: model.id, target, size: model.size });
      this.onProgress({ id: model.id, kind: "model", stage: "done", received: model.size, total: model.size, percent: 100 });
      return { ok: true, path: target, model: model.id };
    } catch (error) {
      fs.rmSync(partPath, { force: true });
      throw error.message === "cancelled" ? new Error("Скачивание модели отменено") : error;
    } finally {
      this._finish(job);
    }
  }

  getStatus() {
    if (!this.job) return null;
    return { label: this.job.label, kind: this.job.kind, startedAt: this.job.startedAt };
  }
}

module.exports = {
  Downloader,
  ENGINE_BUILDS,
  FFMPEG_BUILD,
  MODEL_CATALOG,
  WHISPER_RELEASE_TAG,
  getEngineDir,
  getModelsDir,
  formatMb,
  downloadToFile,
  extractArchive,
};
