const { execFile, spawn } = require("child_process");
const path = require("path");
const { clipboard } = require("electron");

const FAST_PASTE_TIMEOUT_MS = 3500;
const DETECT_TIMEOUT_MS = 1200;
const FOREGROUND_TIMEOUT_MS = 2200;
const RESTORE_DELAY_MS = 550;
const FOREGROUND_SCRIPT = path.join(__dirname, "foreground.ps1");

function runForegroundScript(mode, hwnd, logger) {
  return new Promise((resolve) => {
    const args = [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      FOREGROUND_SCRIPT,
      "-Mode",
      mode,
    ];
    if (hwnd) args.push("-Hwnd", String(hwnd));
    execFile(
      "powershell.exe",
      args,
      { windowsHide: true, timeout: FOREGROUND_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          logger?.debug("Foreground window helper failed", {
            mode,
            error: error.message,
            stderr: String(stderr || "").trim(),
          });
          resolve({ ok: false, error: error.message });
          return;
        }
        resolve({ ok: true, stdout: String(stdout || "").trim() });
      }
    );
  });
}

async function captureForegroundWindow(logger) {
  const result = await runForegroundScript("capture", null, logger);
  if (!result.ok || !result.stdout) return null;
  try {
    const target = JSON.parse(result.stdout);
    if (!target || (!target.hwnd && !target.className && !target.exeName)) return null;
    return {
      hwnd: target.hwnd ? String(target.hwnd) : null,
      title: target.title || "",
      className: target.className || "",
      exeName: target.exeName || "",
      isTerminal: !!target.isTerminal,
    };
  } catch (error) {
    logger?.debug("Foreground window helper returned invalid JSON", {
      error: error.message,
      stdout: result.stdout.slice(0, 500),
    });
    return null;
  }
}

async function restoreForegroundWindow(target, logger) {
  if (!target?.hwnd) return false;
  const result = await runForegroundScript("restore", target.hwnd, logger);
  if (result.ok) {
    logger?.debug("Restored paste target", {
      hwnd: target.hwnd,
      exeName: target.exeName,
      className: target.className,
    });
  }
  return result.ok;
}

async function captureTarget(fastPastePath, logger) {
  const captured = await captureForegroundWindow(logger);
  if (captured) return captured;
  return captureTargetWithFastPaste(fastPastePath, logger);
}

function captureTargetWithFastPaste(fastPastePath, logger) {
  if (!fastPastePath) return Promise.resolve(null);
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const child = spawn(fastPastePath, ["--detect-only"], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Already gone.
      }
      finish(null);
    }, DETECT_TIMEOUT_MS);
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", (error) => {
      logger?.debug("Target capture failed", { error: error.message });
      finish(null);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        logger?.debug("Target capture exited", { code, stderr: stderr.trim() });
        finish(null);
        return;
      }
      const lines = stdout.split(/\r?\n/);
      const target = {};
      for (const line of lines) {
        if (line.startsWith("TARGET ")) target.hwnd = line.slice(7).trim();
        else if (line.startsWith("WINDOW_CLASS ")) target.className = line.slice(13).trim();
        else if (line.startsWith("EXE_NAME ")) target.exeName = line.slice(9).trim();
        else if (line.startsWith("WINDOW_TITLE ")) target.title = line.slice(13).trim();
        else if (line.startsWith("IS_TERMINAL ")) target.isTerminal = line.slice(12).trim() === "true";
      }
      if (!target.hwnd && !target.className && !target.exeName && !target.title) {
        finish(null);
        return;
      }
      logger?.debug("Captured paste target", {
        exeName: target.exeName,
        className: target.className,
        isTerminal: target.isTerminal,
      });
      finish(target);
    });
  });
}

function snapshotClipboard(logger) {
  const snapshot = {
    text: clipboard.readText(),
    html: clipboard.readHTML(),
    rtf: clipboard.readRTF(),
    bookmark: clipboard.readBookmark(),
    image: clipboard.readImage(),
    formats: clipboard.availableFormats(),
  };
  logger?.debug("Clipboard snapshot", {
    hasText: !!snapshot.text,
    hasHtml: !!snapshot.html,
    hasRtf: !!snapshot.rtf,
    hasImage: !snapshot.image.isEmpty(),
    formats: snapshot.formats,
  });
  return snapshot;
}

function restoreClipboard(snapshot, expectedText, logger) {
  if (!snapshot) return false;
  if (expectedText !== undefined && clipboard.readText() !== expectedText) {
    logger?.debug("Clipboard changed after paste, skipping restore");
    return false;
  }
  const data = {};
  if (snapshot.text) data.text = snapshot.text;
  if (snapshot.html) data.html = snapshot.html;
  if (snapshot.rtf) data.rtf = snapshot.rtf;
  if (snapshot.image && !snapshot.image.isEmpty()) data.image = snapshot.image;
  if (snapshot.bookmark && (snapshot.bookmark.url || snapshot.bookmark.title)) {
    data.bookmark = snapshot.bookmark;
  }
  try {
    if (Object.keys(data).length) {
      clipboard.write(data);
    } else {
      clipboard.clear();
    }
    return true;
  } catch (error) {
    logger?.warn("Clipboard restore failed", { error: error.message });
    return false;
  }
}

function runFastPaste(fastPastePath, args, logger) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const child = spawn(fastPastePath, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Already gone.
      }
      logger?.warn("Fast paste timed out");
      finish({ ok: false, error: "timeout" });
    }, FAST_PASTE_TIMEOUT_MS);
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", (error) => {
      finish({ ok: false, error: error.message });
    });
    child.on("close", (code) => {
      finish({
        ok: code === 0 && /PASTE_OK/i.test(stdout),
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

async function pasteText({
  text,
  target,
  fastPastePath,
  logger,
  restorePreviousClipboard = true,
}) {
  if (!text) return { success: false, error: "empty_text" };
  const snapshot = restorePreviousClipboard ? snapshotClipboard(logger) : null;
  clipboard.writeText(text);

  const usedTarget = target || null;
  if (usedTarget?.hwnd) {
    await restoreForegroundWindow(usedTarget, logger);
  }

  if (!fastPastePath) {
    logger?.error("Paste helper is missing");
    return {
      success: false,
      copied: true,
      error: "fast_paste_missing",
      target: usedTarget,
    };
  }

  const result = await runFastPaste(fastPastePath, [], logger);
  if (!result.ok) {
    const error = result.error || result.stderr || `exit ${result.code}`;
    logger?.error("Paste failed", { error });
    return {
      success: false,
      copied: true,
      error,
      target: usedTarget,
    };
  }

  let restoreComplete = Promise.resolve(false);
  if (snapshot) {
    restoreComplete = new Promise((resolve) => {
      setTimeout(() => {
        resolve(restoreClipboard(snapshot, text, logger));
      }, RESTORE_DELAY_MS);
    });
  }

  logger?.info("Text pasted", {
    method: "fast-paste",
    target: usedTarget
      ? { exeName: usedTarget.exeName, className: usedTarget.className, isTerminal: usedTarget.isTerminal }
      : null,
    chars: text.length,
  });

  return { success: true, method: "fast-paste", target: usedTarget, restoreComplete };
}

module.exports = {
  captureTarget,
  pasteText,
  snapshotClipboard,
  restoreClipboard,
  RESTORE_DELAY_MS,
};
