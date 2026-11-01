const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MAX_ENTRIES = 500;

class HistoryStore {
  constructor({ userDataDir, logger }) {
    this.filePath = path.join(userDataDir, "history.json");
    this.logger = logger;
    this.entries = this._load();
  }

  _load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      if (Array.isArray(raw)) return raw.filter(isValidEntry).slice(0, MAX_ENTRIES);
      if (raw && Array.isArray(raw.entries)) return raw.entries.filter(isValidEntry).slice(0, MAX_ENTRIES);
    } catch {
      // No history yet or it was corrupted.
    }
    return [];
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, entries: this.entries }, null, 2), "utf8");
      fs.renameSync(tmp, this.filePath);
    } catch (error) {
      this.logger?.warn("Could not save history", { error: error.message });
    }
  }

  add({ text, durationMs = 0, model = null, language = null, source = "dictation", audioPath = null }) {
    if (!text || !String(text).trim()) return null;
    const entry = {
      id: crypto.randomUUID(),
      text: String(text).trim(),
      createdAt: new Date().toISOString(),
      durationMs: Math.max(0, Math.round(durationMs || 0)),
      model: model || null,
      language: language || null,
      source: source || "dictation",
      audioPath: audioPath || null,
    };
    this.entries.unshift(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.length = MAX_ENTRIES;
    this._save();
    return entry;
  }

  list({ query = "", limit = 200 } = {}) {
    const q = String(query || "").trim().toLowerCase();
    const filtered = q
      ? this.entries.filter((entry) => entry.text.toLowerCase().includes(q))
      : this.entries;
    return filtered.slice(0, Math.max(1, Math.min(MAX_ENTRIES, limit)));
  }

  get(id) {
    return this.entries.find((entry) => entry.id === id) || null;
  }

  remove(id) {
    const before = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.id !== id);
    if (this.entries.length !== before) {
      this._save();
      return true;
    }
    return false;
  }

  clear() {
    this.entries = [];
    this._save();
  }
}

function isValidEntry(entry) {
  return entry && typeof entry.id === "string" && typeof entry.text === "string" && typeof entry.createdAt === "string";
}

module.exports = { HistoryStore, MAX_ENTRIES };
