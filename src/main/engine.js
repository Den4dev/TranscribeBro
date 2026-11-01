const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");

const paths = require("./paths");

const PORT_START = 8178;
const PORT_END = 8199;
const STARTUP_TIMEOUT_MS = 120000;
const READY_POLL_MS = 400;
const IDLE_UNLOAD_MS = 10 * 60 * 1000;
const MAX_RECORDING_SEC = 1800;

class EngineError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = "EngineError";
    this.code = code || "engine_error";
    this.details = details || null;
  }
}

class WhisperEngine {
  constructor({ logger, settingsProvider, userDataDir }) {
    this.logger = logger;
    this.getSettings = settingsProvider;
    this.userDataDir = userDataDir;
    this.process = null;
    this.serverInfo = null;
    this.modelInfo = null;
    this.port = null;
    this.ready = false;
    this.startingPromise = null;
    this.stderr = "";
    this.backend = null;
    this.deviceName = null;
    this.lastError = null;
    this.idleTimer = null;
    this.queue = Promise.resolve();
    this.stopRequested = false;
    this.lastActivityAt = 0;
  }

  getSettingsSafe() {
    try {
      return this.getSettings() || {};
    } catch {
      return {};
    }
  }

  getStatus() {
    const model = this.modelInfo || this.resolveModel();
    const server = this.serverInfo || this.resolveServer();
    return {
      ready: this.ready,
      starting: !!this.startingPromise,
      backend: this.backend,
      deviceName: this.deviceName,
      port: this.port,
      model: model ? model.name : null,
      modelPath: model ? model.path : null,
      serverPath: server ? server.binary : null,
      serverKind: server ? server.kind : null,
      error: this.lastError,
      stderrTail: this.stderr ? this.stderr.slice(-4000) : "",
      ffmpegPath: paths.resolveFfmpeg(),
    };
  }

  resolveModel() {
    const settings = this.getSettingsSafe();
    if (settings.customModelPath && paths.isFile(settings.customModelPath)) {
      return {
        name: modelNameFromPath(settings.customModelPath),
        path: settings.customModelPath,
        source: "custom",
      };
    }
    const models = paths.listModels();
    if (settings.model) {
      const exact = models.find((model) => model.name === settings.model);
      if (exact) return exact;
    }
    if (!models.length) return null;
    const preferred = ["medium", "large-v3-turbo", "large-v3", "small", "base", "tiny"];
    for (const name of preferred) {
      const found = models.find((model) => model.name === name);
      if (found) return found;
    }
    return models[0];
  }

  resolveServer() {
    const settings = this.getSettingsSafe();
    if (settings.customServerPath && paths.isFile(settings.customServerPath)) {
      return {
        kind: /cuda/i.test(settings.customServerPath) ? "cuda" : "cpu",
        binary: settings.customServerPath,
        dir: path.dirname(settings.customServerPath),
      };
    }
    const servers = paths.resolveWhisperServers();
    if (!servers.length) return null;
    const gpu = settings.gpu || "auto";
    if (gpu === "cpu") {
      return servers.find((server) => server.kind === "cpu") || servers[0];
    }
    if (gpu === "cuda") {
      return servers.find((server) => server.kind === "cuda") || servers[0];
    }
    return servers.find((server) => server.kind === "cuda") || servers.find((server) => server.kind === "cpu") || servers[0];
  }

  serverCandidates() {
    const settings = this.getSettingsSafe();
    const servers = paths.resolveWhisperServers();
    if (settings.customServerPath && paths.isFile(settings.customServerPath)) {
      const custom = {
        kind: /cuda/i.test(settings.customServerPath) ? "cuda" : "cpu",
        binary: settings.customServerPath,
        dir: path.dirname(settings.customServerPath),
      };
      return [{ ...custom, noGpu: false }];
    }
    if (!servers.length) return [];
    const gpu = settings.gpu || "auto";
    const cuda = servers.find((server) => server.kind === "cuda");
    const cpu = servers.find((server) => server.kind === "cpu");
    if (gpu === "cpu") {
      return [
        cpu && { ...cpu, noGpu: false },
        cuda && { ...cuda, noGpu: true },
      ].filter(Boolean);
    }
    if (gpu === "cuda") {
      return [
        cuda && { ...cuda, noGpu: false },
        cpu && { ...cpu, noGpu: false },
        cuda && { ...cuda, noGpu: true },
      ].filter(Boolean);
    }
    return [
      cuda && { ...cuda, noGpu: false },
      cpu && { ...cpu, noGpu: false },
      cuda && { ...cuda, noGpu: true },
    ].filter(Boolean);
  }

  async start() {
    if (this.ready && this.process) return this.getStatus();
    if (this.startingPromise) return this.startingPromise;
    this.startingPromise = this._startInternal().finally(() => {
      this.startingPromise = null;
    });
    return this.startingPromise;
  }

  async _startInternal() {
    this.stopRequested = false;
    this.lastError = null;
    const model = this.resolveModel();
    if (!model) {
      throw new EngineError(
        "Модель Whisper не найдена. Поместите модель ggml-*.bin в папку моделей или установите её через OpenWhispr.",
        "model_missing"
      );
    }
    this.modelInfo = model;

    const candidates = this.serverCandidates();
    if (!candidates.length) {
      throw new EngineError(
        "whisper-server не найден. Установите OpenWhispr или укажите свой путь к whisper-server.",
        "server_missing"
      );
    }

    let lastFailure = null;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      try {
        await this._startWith(candidate, model);
        if (i > 0) {
          this.logger.warn("Whisper engine started with fallback backend", {
            backend: this.backend,
            binary: candidate.binary,
          });
        }
        return this.getStatus();
      } catch (error) {
        lastFailure = error;
        this.logger.warn("Whisper engine candidate failed", {
          binary: candidate.binary,
          kind: candidate.kind,
          noGpu: !!candidate.noGpu,
          error: error.message,
        });
        await this.stop({ keepError: true, internal: true });
      }
    }

    this.lastError = lastFailure ? lastFailure.message : "Не удалось запустить локальный движок Whisper";
    throw lastFailure || new EngineError(this.lastError, "engine_start_failed");
  }

  async _startWith(server, model) {
    const port = await findFreePort(PORT_START, PORT_END);
    if (!port) {
      throw new EngineError("Нет свободного порта для локального движка Whisper", "no_port");
    }
    this.port = port;
    this.serverInfo = server;
    this.backend = null;
    this.deviceName = null;
    this.stderr = "";
    this.ready = false;

    const settings = this.getSettingsSafe();
    const threads = Math.max(1, Math.min(12, Math.floor((os.cpus().length || 4) * 0.75)));
    const args = [
      "--model", model.path,
      "--host", "127.0.0.1",
      "--port", String(port),
      "--language", "auto",
      "--max-len", "4096",
      "--threads", String(threads),
    ];
    if (server.noGpu) args.push("--no-gpu");
    if (settings.gpu !== "cpu" && server.kind === "cuda" && !server.noGpu) {
      args.push("--device", "0");
    }
    if (settings.vadEnabled) {
      const vadModel = paths.resolveVadModel();
      if (vadModel) {
        args.push(
          "--vad",
          "--vad-model", vadModel,
          "--vad-threshold", "0.5",
          "--vad-min-speech-duration-ms", "250",
          "--vad-min-silence-duration-ms", "200",
          "--vad-max-speech-duration-s", "30",
          "--vad-speech-pad-ms", "100",
          "--vad-samples-overlap", "0.5"
        );
      }
    }

    const env = { ...process.env };
    env.PATH = `${server.dir}${path.delimiter}${env.PATH || ""}`;
    if (server.kind === "cuda") {
      env.CUDA_DEVICE_ORDER = "PCI_BUS_ID";
      env.GGML_CUDA_DISABLE_GRAPHS = "0";
    }

    this.logger.info("Starting whisper-server", {
      binary: server.binary,
      kind: server.kind,
      noGpu: !!server.noGpu,
      port,
      model: model.name,
      modelPath: model.path,
      threads,
    });

    const child = spawn(server.binary, args, {
      cwd: server.dir,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    this.process = child;
    this._childExit = null;

    child.stdout.on("data", (data) => {
      const text = data.toString();
      this.stderr = appendTail(this.stderr, text, 20000);
      this.logger.debug("whisper-server stdout", { text: text.trim().slice(0, 2000) });
    });
    child.stderr.on("data", (data) => {
      const text = data.toString();
      this.stderr = appendTail(this.stderr, text, 20000);
      this._parseServerLog(text);
      this.logger.debug("whisper-server stderr", { text: text.trim().slice(0, 2000) });
    });
    child.on("error", (error) => {
      this._childExit = { error };
      this.ready = false;
      this.logger.error("whisper-server process error", { error: error.message });
    });
    child.on("close", (code, signal) => {
      this._childExit = { code, signal };
      this.ready = false;
      this.process = null;
      this.logger.info("whisper-server exited", { code, signal });
    });

    const startedAt = Date.now();
    let lastProbeError = null;
    while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
      if (this.stopRequested) throw new EngineError("Запуск движка Whisper отменён", "cancelled");
      if (this._childExit) {
        const exit = this._childExit;
        throw new EngineError(
          `whisper-server завершился при запуске (${exit.error ? exit.error.message : `код ${exit.code ?? "null"}`})`,
          "server_exited",
          { stderr: this.stderr.slice(-4000) }
        );
      }
      try {
        const ok = await probeServer(port, 1200);
        if (ok) {
          this.ready = true;
          this.lastActivityAt = Date.now();
          this._parseBackendFromLog();
          this.logger.info("whisper-server ready", {
            port,
            backend: this.backend,
            device: this.deviceName,
            loadMs: Date.now() - startedAt,
          });
          this.resetIdleTimer();
          return;
        }
      } catch (error) {
        lastProbeError = error;
      }
      await sleep(READY_POLL_MS);
    }

    throw new EngineError(
      `whisper-server не запустился за ${Math.round(STARTUP_TIMEOUT_MS / 1000)} с${
        lastProbeError ? ` (${lastProbeError.message})` : ""
      }`,
      "start_timeout",
      { stderr: this.stderr.slice(-4000) }
    );
  }

  _parseServerLog(text) {
    const gpu = text.match(/whisper_backend_init_gpu:\s*using\s+(CUDA|Vulkan|CPU)\d*\s+backend/i);
    if (gpu) {
      this.backend = gpu[1].toLowerCase();
    }
    const device = text.match(/Device\s+\d+:\s*([^,\r\n]+)/i);
    if (device && !this.deviceName) {
      this.deviceName = device[1].trim();
    }
    if (/ggml_cuda_init:\s*found\s+\d+\s+CUDA\s+devices/i.test(text) && !this.deviceName) {
      this.deviceName = "NVIDIA GPU";
    }
  }

  _parseBackendFromLog() {
    if (!this.backend) {
      this.backend = this.serverInfo && this.serverInfo.kind === "cuda" && !this.serverInfo.noGpu ? "cuda" : "cpu";
    }
    if (!this.deviceName && this.backend === "cuda") this.deviceName = "NVIDIA GPU";
  }

  async stop({ keepError = false, internal = false } = {}) {
    if (!internal) this.stopRequested = true;
    this._clearIdleTimer();
    const child = this.process;
    this.process = null;
    this.ready = false;
    this.port = null;
    if (child) {
      this.logger.info("Stopping whisper-server", { pid: child.pid });
      try {
        child.kill();
      } catch {
        // Already gone.
      }
      const exited = await waitForExit(child, 2500);
      if (!exited) {
        try {
          process.kill(child.pid, "SIGKILL");
        } catch {
          // Already gone.
        }
      }
    }
    if (!keepError) {
      this.backend = null;
      this.deviceName = null;
    }
  }

  async restart() {
    await this.stop();
    return this.start();
  }

  resetIdleTimer() {
    this._clearIdleTimer();
    const settings = this.getSettingsSafe();
    if (settings.keepEngineLoaded === false && this.ready) {
      this.idleTimer = setTimeout(() => {
        this.logger.info("Unloading idle Whisper engine");
        this.stop().catch(() => {});
      }, IDLE_UNLOAD_MS);
      if (this.idleTimer.unref) this.idleTimer.unref();
    }
  }

  _clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  transcribe(wavBuffer, options = {}) {
    const run = () => this._transcribe(wavBuffer, options);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }

  async _transcribe(wavBuffer, options = {}) {
    if (!wavBuffer || !wavBuffer.length) {
      throw new EngineError("Аудиобуфер пуст", "empty_audio");
    }
    if (!this.ready || !this.process) {
      await this.start();
    }

    const settings = this.getSettingsSafe();
    const language = options.language || settings.language || "auto";
    const prompt = (options.prompt !== undefined ? options.prompt : settings.customVocabulary || "")
      .replace(/[\r\n]+/g, " ")
      .trim();
    const durationSec = Math.max(0.5, (wavBuffer.length - 44) / 32000);
    const timeoutMs = options.timeoutMs || Math.max(30000, Math.round(durationSec * 2.5 + 15000));

    const boundary = `----TranscribeBro${crypto.randomBytes(8).toString("hex")}`;
    const fields = {
      language,
      response_format: "json",
      entropy_thold: "2.8",
      logprob_thold: "-1.25",
      no_speech_thold: "0.6",
    };
    if (prompt) fields.prompt = prompt;
    const body = buildMultipart(boundary, wavBuffer, fields);

    const attempt = async () => {
      const response = await httpPost({
        host: "127.0.0.1",
        port: this.port,
        path: "/inference",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
        body,
        timeoutMs,
      });
      if (response.statusCode !== 200) {
        throw new EngineError(
          `whisper-server вернул HTTP ${response.statusCode}`,
          "server_http_error",
          { body: response.body.toString("utf8").slice(0, 1000) }
        );
      }
      let parsed;
      try {
        parsed = JSON.parse(response.body.toString("utf8"));
      } catch (error) {
        throw new EngineError(`Некорректный ответ whisper-server: ${error.message}`, "invalid_response");
      }
      const text = normalizeWhitespace(typeof parsed.text === "string" ? parsed.text : "");
      this.lastActivityAt = Date.now();
      this.resetIdleTimer();
      return { text, raw: parsed, language, durationSec };
    };

    try {
      return await attempt();
    } catch (error) {
      const processGone = !this.process || this._childExit;
      if (error.code === "server_http_error" || error.code === "invalid_response") throw error;
      if (!processGone) throw error;
      this.logger.warn("whisper-server connection lost, restarting once", { error: error.message });
      await this.stop();
      await this.start();
      return attempt();
    }
  }

  async transcribeFile(filePath, options = {}) {
    if (!paths.isFile(filePath)) {
      throw new EngineError(`Аудиофайл не найден: ${filePath}`, "file_not_found");
    }
    const ffmpeg = options.ffmpegPath || paths.resolveFfmpeg();
    if (!ffmpeg) {
      throw new EngineError(
        "FFmpeg не найден. Установите OpenWhispr или укажите свой путь к FFmpeg для распознавания не-WAV файлов.",
        "ffmpeg_missing"
      );
    }
    const tempDir = path.join(this.userDataDir, "tmp");
    fs.mkdirSync(tempDir, { recursive: true });
    const outPath = path.join(tempDir, `transcribe-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.wav`);
    try {
      await convertToWav(ffmpeg, filePath, outPath, options.onProgress);
      const wav = fs.readFileSync(outPath);
      const durationSec = Math.max(0, (wav.length - 44) / 32000);
      const result = await this.transcribe(wav, {
        language: options.language,
        prompt: options.prompt,
        timeoutMs: Math.max(60000, Math.round(durationSec * 2.5 + 30000)),
      });
      return { ...result, durationSec };
    } finally {
      try {
        fs.unlinkSync(outPath);
      } catch {
        // Temp file already gone.
      }
    }
  }
}

function modelNameFromPath(filePath) {
  return path.basename(filePath).replace(/^ggml-/i, "").replace(/\.bin$/i, "");
}

function appendTail(existing, chunk, max) {
  const next = existing + chunk;
  return next.length > max ? next.slice(next.length - max) : next;
}

function normalizeWhitespace(text) {
  const normalized = String(text || "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (/^\[\s*blank_audio\s*\]$/i.test(normalized)) return "";
  return normalized;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.removeListener("close", onClose);
      resolve(value);
    };
    const onClose = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("close", onClose);
  });
}

function probeServer(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/", timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(res.statusCode < 500);
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("probe timeout"));
    });
    req.on("error", reject);
  });
}

function httpPost({ host, port, path: requestPath, headers, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host, port, path: requestPath, method: "POST", headers, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks) }));
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("Истекло время запроса на распознавание"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function buildMultipart(boundary, wavBuffer, fields) {
  const parts = [];
  parts.push(
    Buffer.from(
      `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n' +
        "Content-Type: audio/wav\r\n\r\n"
    )
  );
  parts.push(wavBuffer);
  parts.push(Buffer.from("\r\n"));
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
          `${String(value).replace(/[\r\n]+/g, " ")}\r\n`
      )
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(parts);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findFreePort(start, end) {
  for (let port = start; port <= end; port++) {
    if (await isPortFree(port)) return port;
  }
  return null;
}

function convertToWav(ffmpeg, inputPath, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-nostdin",
      "-y",
      "-i", inputPath,
      "-vn",
      "-ar", "16000",
      "-ac", "1",
      "-c:a", "pcm_s16le",
      outputPath,
    ];
    const child = spawn(ffmpeg, args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let progressTimer = null;
    child.stderr.on("data", (data) => {
      const text = data.toString();
      stderr = appendTail(stderr, text, 12000);
      if (onProgress) {
        const match = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (match) {
          const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
          clearTimeout(progressTimer);
          progressTimer = setTimeout(() => onProgress({ seconds }), 100);
        }
      }
    });
    child.on("error", (error) => {
      clearTimeout(progressTimer);
      reject(new EngineError(`Ошибка FFmpeg: ${error.message}`, "ffmpeg_error"));
    });
    child.on("close", (code) => {
      clearTimeout(progressTimer);
      if (code === 0) {
        resolve();
      } else {
        reject(
          new EngineError(`FFmpeg завершился с кодом ${code}`, "ffmpeg_error", {
            stderr: stderr.slice(-4000),
          })
        );
      }
    });
  });
}

module.exports = { WhisperEngine, EngineError, MAX_RECORDING_SEC };
