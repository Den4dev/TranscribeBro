const fs = require("fs");
const os = require("os");
const path = require("path");

function getUserDataDir() {
  try {
    const { app } = require("electron");
    if (app && typeof app.getPath === "function") return app.getPath("userData");
  } catch {
    // Running outside Electron (tests / smoke scripts).
  }
  return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "TranscribeBro");
}

function getAppRoot() {
  return path.resolve(__dirname, "..", "..");
}

function getBundledBinDir() {
  if (process.resourcesPath && !process.resourcesPath.includes("node_modules")) {
    const packaged = path.join(process.resourcesPath, "bin");
    if (fs.existsSync(packaged)) return packaged;
  }
  return path.join(getAppRoot(), "bin");
}

function getBundledAssetsDir() {
  if (process.resourcesPath && !process.resourcesPath.includes("node_modules")) {
    const packaged = path.join(process.resourcesPath, "assets");
    if (fs.existsSync(packaged)) return packaged;
  }
  return path.join(getAppRoot(), "src", "assets");
}

function isFile(filePath) {
  try {
    return !!filePath && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function uniqueExisting(paths) {
  const seen = new Set();
  const out = [];
  for (const candidate of paths) {
    if (!candidate) continue;
    const normalized = path.resolve(candidate);
    if (seen.has(normalized.toLowerCase())) continue;
    seen.add(normalized.toLowerCase());
    if (isFile(normalized)) out.push(normalized);
  }
  return out;
}

function programFilesCandidates() {
  const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "Programs")
    : null].filter(Boolean);
  const out = [];
  for (const root of roots) {
    out.push(path.join(root, "OpenWhispr", "resources", "bin"));
    out.push(path.join(root, "OpenWhispr", "resources", "app.asar.unpacked", "node_modules", "ffmpeg-static"));
  }
  return out;
}

function openWhisprAppDataBin() {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "open-whispr", "bin");
}

function resolveWhisperServers() {
  const bundled = getBundledBinDir();
  const userBin = path.join(getUserDataDir(), "bin");
  const appDataBin = openWhisprAppDataBin();
  const programDirs = programFilesCandidates().filter((p) => p.endsWith("bin"));
  const cuda = uniqueExisting([
    path.join(bundled, "whisper-server-win32-x64-cuda.exe"),
    path.join(userBin, "whisper-server-win32-x64-cuda.exe"),
    path.join(appDataBin, "whisper-server-win32-x64-cuda.exe"),
    ...programDirs.map((d) => path.join(d, "whisper-server-win32-x64-cuda.exe")),
  ]).map((binary) => ({ kind: "cuda", binary, dir: path.dirname(binary) }));

  const cpu = uniqueExisting([
    path.join(bundled, "whisper-server-win32-x64.exe"),
    path.join(bundled, "whisper-server", "whisper-server-win32-x64.exe"),
    path.join(userBin, "whisper-server-win32-x64.exe"),
    path.join(userBin, "whisper-server.exe"),
    ...programDirs.map((d) => path.join(d, "whisper-server-win32-x64.exe")),
    path.join(appDataBin, "whisper-server-win32-x64.exe"),
  ]).map((binary) => ({ kind: "cpu", binary, dir: path.dirname(binary) }));

  return [...cuda, ...cpu];
}

function resolveFastPaste() {
  const bundled = getBundledBinDir();
  return uniqueExisting([
    path.join(bundled, "windows-fast-paste.exe"),
    ...programFilesCandidates().filter((p) => p.endsWith("bin")).map((d) => path.join(d, "windows-fast-paste.exe")),
    path.join(openWhisprAppDataBin(), "windows-fast-paste.exe"),
  ])[0] || null;
}

function resolveKeyListener() {
  const bundled = getBundledBinDir();
  return uniqueExisting([
    path.join(bundled, "windows-key-listener.exe"),
    ...programFilesCandidates().filter((p) => p.endsWith("bin")).map((d) => path.join(d, "windows-key-listener.exe")),
    path.join(openWhisprAppDataBin(), "windows-key-listener.exe"),
  ])[0] || null;
}

function resolveFfmpeg() {
  const bundled = getBundledBinDir();
  const userBin = path.join(getUserDataDir(), "bin");
  const unpackedFfmpegDirs = programFilesCandidates().filter((p) => p.includes("ffmpeg-static"));
  return uniqueExisting([
    path.join(bundled, "ffmpeg.exe"),
    path.join(userBin, "ffmpeg.exe"),
    ...unpackedFfmpegDirs.map((d) => path.join(d, "ffmpeg.exe")),
    ...programFilesCandidates().filter((p) => p.endsWith("bin")).map((d) => path.join(d, "ffmpeg.exe")),
  ])[0] || null;
}

function resolveVadModel() {
  const bundled = getBundledBinDir();
  return uniqueExisting([
    path.join(bundled, "whisper-vad", "ggml-silero-v5.1.2.bin"),
    ...programFilesCandidates().filter((p) => p.endsWith("bin")).map((d) => path.join(d, "whisper-vad", "ggml-silero-v5.1.2.bin")),
  ])[0] || null;
}

function modelDirs() {
  const home = os.homedir();
  return [
    { dir: path.join(getUserDataDir(), "models"), source: "user" },
    { dir: path.join(getBundledBinDir(), "..", "models"), source: "bundled" },
    { dir: path.join(getAppRoot(), "models"), source: "project" },
    { dir: path.join(home, ".cache", "openwhispr", "whisper-models"), source: "openwhispr" },
    { dir: path.join(home, ".cache", "whisper"), source: "whisper" },
    { dir: path.join(home, ".cache", "whisper.cpp", "models"), source: "whisper" },
    { dir: path.join(process.env.LOCALAPPDATA || "", "whisper.cpp", "models"), source: "whisper" },
  ];
}

function listModels() {
  const byName = new Map();
  for (const { dir, source } of modelDirs()) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !/^ggml-.+\.bin$/i.test(entry.name)) continue;
      if (/^ggml-(silero|vad)/i.test(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      const name = entry.name.replace(/^ggml-/i, "").replace(/\.bin$/i, "");
      let size = 0;
      try {
        size = fs.statSync(fullPath).size;
      } catch {
        continue;
      }
      const existing = byName.get(name);
      if (!existing || existing.size < size) {
        byName.set(name, { name, path: fullPath, size, source });
      }
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function getModelPath(name) {
  if (!name) return null;
  const found = listModels().find((model) => model.name === name);
  return found ? found.path : null;
}

function getLogDir() {
  return path.join(getUserDataDir(), "logs");
}

function getAudioDir() {
  return path.join(getUserDataDir(), "audio");
}

module.exports = {
  getUserDataDir,
  getAppRoot,
  getBundledBinDir,
  getBundledAssetsDir,
  resolveWhisperServers,
  resolveFastPaste,
  resolveKeyListener,
  resolveFfmpeg,
  resolveVadModel,
  listModels,
  getModelPath,
  modelDirs,
  getLogDir,
  getAudioDir,
  isFile,
};
