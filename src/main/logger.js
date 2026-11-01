const fs = require("fs");
const path = require("path");

const MAX_LOG_BYTES = 2 * 1024 * 1024;

class Logger {
  constructor(logDir) {
    this.logDir = logDir;
    this.logPath = path.join(logDir, "app.log");
    this.oldLogPath = path.join(logDir, "app.log.1");
    this.verbose = false;
    this.ready = false;
    this._ensureDir();
  }

  _ensureDir() {
    try {
      fs.mkdirSync(this.logDir, { recursive: true });
      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  _rotateIfNeeded() {
    try {
      const stats = fs.statSync(this.logPath);
      if (stats.size > MAX_LOG_BYTES) {
        try {
          fs.unlinkSync(this.oldLogPath);
        } catch {
          // No previous log.
        }
        fs.renameSync(this.logPath, this.oldLogPath);
      }
    } catch {
      // First write.
    }
  }

  _write(level, message, meta) {
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}${
      meta ? ` ${safeStringify(meta)}` : ""
    }\n`;
    if (this.verbose || level !== "debug") {
      try {
        process.stdout.write(line);
      } catch {
        // Detached console.
      }
    }
    if (!this.ready) return;
    try {
      this._rotateIfNeeded();
      fs.appendFileSync(this.logPath, line, "utf8");
    } catch {
      // Logging must never take the app down.
    }
  }

  debug(message, meta) {
    this._write("debug", message, meta);
  }

  info(message, meta) {
    this._write("info", message, meta);
  }

  warn(message, meta) {
    this._write("warn", message, meta);
  }

  error(message, meta) {
    this._write("error", message, meta);
  }

  setVerbose(value) {
    this.verbose = !!value;
  }

  tail(lines = 200) {
    try {
      const content = fs.readFileSync(this.logPath, "utf8");
      return content.split(/\r?\n/).slice(-lines).join("\n");
    } catch {
      return "";
    }
  }
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

module.exports = { Logger, MAX_LOG_BYTES };
