import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const SCHEMA = "sancho.telemetry.v1";
const FLUSH_INTERVAL_MS = 10_000;
const MAX_BUFFER_SIZE = 50;

let logPath;
let buffer = [];
let flushTimer;

export function initTelemetry(options = {}) {
  logPath = options.logPath ?? defaultTelemetryPath();
  scheduleFlush();
}

export function recordPrediction(event = {}) {
  if (!logPath) return;
  push({
    schema: SCHEMA,
    type: "pred",
    ts: Date.now(),
    code: event.code,
    codeLen: event.code?.length ?? 0,
    candN: event.candN ?? 0,
    runner: event.runner ?? "lexicon",
    latMs: event.latMs ?? null,
    cacheHit: event.cacheHit ?? false,
    rankN: event.rankN ?? 0,
    suggN: event.suggN ?? 0
  });
}

export function recordCommit(event = {}) {
  if (!logPath) return;
  push({
    schema: SCHEMA,
    type: "commit",
    ts: Date.now(),
    text: event.text ?? "",
    app: event.app ?? "",
    code: event.code,
    codeLen: event.code?.length ?? 0,
    pickPos: event.pickPos,
    pickSource: event.pickSource ?? null
  });
}

export function recordSession(session = {}) {
  if (!logPath) return;
  push({
    schema: SCHEMA,
    type: "session",
    ts: Date.now(),
    app: session.app ?? "",
    chars: session.chars ?? 0,
    keystrokes: session.keystrokes ?? 0,
    backspaces: session.backspaces ?? 0,
    top1Rate: round3(session.top1Rate),
    enRatio: round3(session.enRatio),
    dictHits: session.dictHits ?? 0,
    durationSec: session.durationSec ?? null
  });
}

export function recordEvent(type, fields = {}) {
  if (!logPath) return;
  push({
    schema: SCHEMA,
    type,
    ts: Date.now(),
    ...fields
  });
}

export async function flushTelemetry() {
  if (!logPath || buffer.length === 0) return;
  const lines = buffer.splice(0).map((e) => JSON.stringify(e)).join("\n") + "\n";
  try {
    await mkdir(logPath.split("/").slice(0, -1).join("/") || "/", { recursive: true });
    await appendFile(logPath, lines, "utf8");
  } catch { /* telemetry never breaks the main chain */ }
}

export function defaultTelemetryPath(home = homedir()) {
  return join(home, "Library", "Application Support", "SanchoAiIME", "telemetry", "events.jsonl");
}

function push(event) {
  buffer.push(event);
  if (buffer.length >= MAX_BUFFER_SIZE) {
    void flushTelemetry();
  }
}

function scheduleFlush() {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(() => {
    void flushTelemetry();
  }, FLUSH_INTERVAL_MS);
  flushTimer.unref();
}

function round3(value) {
  return value === undefined || value === null ? null : Math.round(value * 1000) / 1000;
}
