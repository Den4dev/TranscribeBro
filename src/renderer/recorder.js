const api = window.recorderApi;
const TARGET_SAMPLE_RATE = 16000;
const PRE_ROLL_MS = 350;

let stream = null;
let audioContext = null;
let sourceNode = null;
let workletNode = null;
let scriptNode = null;
let sinkNode = null;
let usingWorklet = false;
let configuredOptions = null;
let permissionProbed = false;

let recording = false;
let stopping = false;
let streamDeviceId = "default";
let chunks = [];
let totalSamples = 0;
let peak = 0;
let recordingStartedAt = 0;
let maxSamples = Infinity;
let autoStopTimer = null;
let lastLevelSentAt = 0;
let currentDeviceLabel = "";

let ringChunks = [];
let ringSamples = 0;

function sendError(code, message, details) {
  api.error({ code, message, details: details || null });
}

function sendLevel(level, extra) {
  const now = performance.now();
  if (now - lastLevelSentAt < 55) return;
  lastLevelSentAt = now;
  api.level({ level: Math.max(0, Math.min(1, level)), ...extra });
}

function rmsToLevel(rms) {
  if (!Number.isFinite(rms) || rms <= 1e-8) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

function computeRms(float32) {
  let sum = 0;
  for (let i = 0; i < float32.length; i++) sum += float32[i] * float32[i];
  return Math.sqrt(sum / float32.length);
}

function floatToInt16(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

function handleFloatChunk(float32) {
  const rms = computeRms(float32);
  const level = rmsToLevel(rms);
  const int16 = floatToInt16(float32);

  let chunkPeak = 0;
  for (let i = 0; i < int16.length; i++) {
    const value = Math.abs(int16[i]);
    if (value > chunkPeak) chunkPeak = value;
  }
  const normalizedPeak = chunkPeak / 32768;

  if (recording) {
    chunks.push(int16);
    totalSamples += int16.length;
    if (normalizedPeak > peak) peak = normalizedPeak;
    sendLevel(level, { peak: peak });
    if (totalSamples >= maxSamples) {
      stopRecording({ autoStopped: true }).catch(() => {});
    }
    return;
  }

  if (configuredOptions?.keepMicWarm) {
    const preRollTarget = Math.round(
      ((audioContext?.sampleRate || TARGET_SAMPLE_RATE) * PRE_ROLL_MS) / 1000
    );
    ringChunks.push(int16);
    ringSamples += int16.length;
    while (ringSamples > preRollTarget && ringChunks.length > 1) {
      const removed = ringChunks.shift();
      ringSamples -= removed.length;
    }
    sendLevel(level * 0.35, { warm: true });
  }
}

async function probePermission() {
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach((track) => track.stop());
    permissionProbed = true;
  } catch (error) {
    permissionProbed = false;
    console.warn("Microphone permission probe failed", error?.name, error?.message);
  }
  api.ready();
}

async function setupGraph(audioStream) {
  await teardownGraph();
  stream = audioStream;
  const track = stream.getAudioTracks()[0];
  currentDeviceLabel = track?.label || "";
  audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE, latencyHint: "interactive" });
  if (audioContext.state === "suspended") await audioContext.resume();

  sourceNode = audioContext.createMediaStreamSource(stream);
  sinkNode = audioContext.createGain();
  sinkNode.gain.value = 0;

  try {
    const workletUrl = new URL("pcm-worklet.js", window.location.href).href;
    await audioContext.audioWorklet.addModule(workletUrl);
    workletNode = new AudioWorkletNode(audioContext, "pcm-processor");
    workletNode.port.onmessage = (event) => handleFloatChunk(event.data);
    sourceNode.connect(workletNode);
    workletNode.connect(sinkNode);
    usingWorklet = true;
  } catch (error) {
    console.warn("AudioWorklet unavailable, falling back to ScriptProcessor", error?.message);
    scriptNode = audioContext.createScriptProcessor(1024, 1, 1);
    scriptNode.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input.length);
      copy.set(input);
      handleFloatChunk(copy);
    };
    sourceNode.connect(scriptNode);
    scriptNode.connect(sinkNode);
    usingWorklet = false;
  }

  sinkNode.connect(audioContext.destination);
  return audioContext.sampleRate;
}

async function teardownGraph() {
  if (scriptNode) {
    try {
      scriptNode.disconnect();
    } catch {
      // Already disconnected.
    }
    scriptNode.onaudioprocess = null;
    scriptNode = null;
  }
  if (workletNode) {
    try {
      workletNode.port.onmessage = null;
      workletNode.disconnect();
    } catch {
      // Already disconnected.
    }
    workletNode = null;
  }
  if (sourceNode) {
    try {
      sourceNode.disconnect();
    } catch {
      // Already disconnected.
    }
    sourceNode = null;
  }
  if (sinkNode) {
    try {
      sinkNode.disconnect();
    } catch {
      // Already disconnected.
    }
    sinkNode = null;
  }
  if (audioContext) {
    try {
      await audioContext.close();
    } catch {
      // Already closed.
    }
    audioContext = null;
  }
  if (stream) {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // Already stopped.
      }
    });
    stream = null;
  }
  ringChunks = [];
  ringSamples = 0;
}

async function acquireStream(options) {
  const enhanced = options.enhanceAudio !== false;
  const baseAudio = {
    channelCount: 1,
    sampleRate: { ideal: TARGET_SAMPLE_RATE },
    echoCancellation: enhanced,
    noiseSuppression: enhanced,
    autoGainControl: enhanced,
  };
  const attempts = [];
  if (options.deviceId && options.deviceId !== "default") {
    attempts.push({ ...baseAudio, deviceId: { exact: options.deviceId } });
  }
  attempts.push(baseAudio);

  let lastError = null;
  for (const audio of attempts) {
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
      streamDeviceId = options.deviceId || "default";
      return nextStream;
    } catch (error) {
      lastError = error;
      if (error?.name === "NotAllowedError" || error?.name === "SecurityError") break;
    }
  }
  throw lastError || new Error("Не удалось открыть микрофон");
}

async function configureWarm(options) {
  const previousDeviceId = configuredOptions?.deviceId;
  const deviceChanged = options.deviceId !== undefined && options.deviceId !== previousDeviceId;
  configuredOptions = { ...(configuredOptions || {}), ...options };
  if (recording) return;
  const shouldWarm = options.keepMicWarm === true;
  if (!shouldWarm) {
    if (stream && !recording) await teardownGraph();
    api.configured({ warm: false });
    return;
  }
  try {
    if (!stream || deviceChanged) {
      const nextStream = await acquireStream(options);
      await setupGraph(nextStream);
    }
    ringChunks = [];
    ringSamples = 0;
    api.configured({ warm: true, sampleRate: audioContext?.sampleRate || TARGET_SAMPLE_RATE });
  } catch (error) {
    api.configured({ warm: false, error: error?.message || String(error) });
    sendError(error?.name || "mic_error", error?.message || "Не удалось открыть микрофон");
  }
}

async function startRecording(options) {
  if (recording || stopping) return;
  configuredOptions = { ...(configuredOptions || {}), ...options };
  try {
    const requestedDeviceId = options.deviceId || "default";
    const needsStream = !stream || !audioContext || streamDeviceId !== requestedDeviceId;
    if (needsStream) {
      const nextStream = await acquireStream(options);
      await setupGraph(nextStream);
    } else if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    chunks = [];
    totalSamples = 0;
    peak = 0;
    recording = true;
    stopping = false;
    recordingStartedAt = performance.now();
    maxSamples = Math.max(1, Math.round((options.maxDurationSec || 300) * (audioContext?.sampleRate || TARGET_SAMPLE_RATE)));
    if (configuredOptions?.keepMicWarm && ringChunks.length) {
      chunks = ringChunks.slice();
      totalSamples = ringSamples;
      ringChunks = [];
      ringSamples = 0;
    }
    if (autoStopTimer) clearTimeout(autoStopTimer);
    autoStopTimer = setTimeout(() => {
      stopRecording({ autoStopped: true }).catch(() => {});
    }, Math.max(1000, (options.maxDurationSec || 300) * 1000 + 250));

    if (options.playSounds !== false) playCue("start");
    api.started({
      sampleRate: audioContext?.sampleRate || TARGET_SAMPLE_RATE,
      deviceLabel: currentDeviceLabel,
      usingWorklet,
    });
  } catch (error) {
    recording = false;
    sendError(error?.name || "mic_error", error?.message || "Не удалось открыть микрофон");
  }
}

async function stopRecording(meta = {}) {
  if (!recording || stopping) return;
  stopping = true;
  recording = false;
  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }
  if (configuredOptions?.playSounds !== false) playCue("stop");

  await sleep(90);

  const sampleRate = audioContext?.sampleRate || TARGET_SAMPLE_RATE;
  const durationMs = (totalSamples / sampleRate) * 1000;
  const autoStopped = meta.autoStopped === true;

  if (totalSamples < Math.round(sampleRate * 0.25)) {
    chunks = [];
    totalSamples = 0;
    stopping = false;
    sendError("too_short", "Recording was too short.");
    if (!configuredOptions?.keepMicWarm) await teardownGraph();
    return;
  }

  let pcm = concatInt16(chunks);
  chunks = [];
  totalSamples = 0;
  if (sampleRate !== TARGET_SAMPLE_RATE) {
    pcm = resampleInt16(pcm, sampleRate, TARGET_SAMPLE_RATE);
  }
  const wav = encodeWav(pcm, TARGET_SAMPLE_RATE);
  const peakValue = peak;
  peak = 0;
  stopping = false;

  if (!configuredOptions?.keepMicWarm) await teardownGraph();

  api.result({
    wav,
    durationMs,
    sampleRate: TARGET_SAMPLE_RATE,
    originalSampleRate: sampleRate,
    peak: peakValue,
    autoStopped,
    deviceLabel: currentDeviceLabel,
  });
}

async function cancelRecording() {
  if (!recording) return;
  recording = false;
  stopping = false;
  chunks = [];
  totalSamples = 0;
  peak = 0;
  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }
  if (!configuredOptions?.keepMicWarm) await teardownGraph();
}

function concatInt16(parts) {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Int16Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function resampleInt16(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = toRate / fromRate;
  const outLength = Math.max(1, Math.floor(input.length * ratio));
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const position = i / ratio;
    const index = Math.floor(position);
    const next = Math.min(index + 1, input.length - 1);
    const fraction = position - index;
    out[i] = Math.round(input[index] * (1 - fraction) + input[next] * fraction);
  }
  return out;
}

function encodeWav(pcm, sampleRate) {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, pcm.length * 2, true);
  let offset = 44;
  for (let i = 0; i < pcm.length; i++, offset += 2) {
    view.setInt16(offset, pcm[i], true);
  }
  return buffer;
}

function writeString(view, offset, text) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

function playCue(type) {
  try {
    const ctx = audioContext || new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    const notes = type === "start" ? [880, 1174.66] : [659.25];
    notes.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      const start = now + index * 0.075;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.045, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.085);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.1);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          // Already disconnected.
        }
      };
    });
    if (!audioContext) {
      setTimeout(() => ctx.close().catch(() => {}), 400);
    }
  } catch {
    // Sound cues are optional.
  }
}

async function listDevices(requestId) {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices
      .filter((device) => device.kind === "audioinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Микрофон ${index + 1}`,
        groupId: device.groupId,
        isDefault: device.deviceId === "default" || device.deviceId === "communications",
      }));
    api.devices(requestId, inputs, null);
  } catch (error) {
    api.devices(requestId, [], error?.message || "Не удалось получить список микрофонов");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

api.onStart((options) => startRecording(options || {}));
api.onStop(() => stopRecording().catch(() => {}));
api.onCancel(() => cancelRecording().catch(() => {}));
api.onConfigure((options) => configureWarm(options || {}).catch(() => {}));
api.onGetDevices((requestId) => listDevices(requestId));

probePermission().catch(() => api.ready());
