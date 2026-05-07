import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCustomPhraseText } from "@sancho-ai-ime/quick-dictionary";

import { getLocalPredictorState } from "./model-runtime.js";
import { macCustomPhrasePath } from "./platform.js";
import {
  createAsyncPredictionRunner,
  normalizeRunnerPrediction
} from "./predictor-runner.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_EN_WORD_LIST_PATH = resolve(MODULE_DIR, "en-word-list.json");

export const DEFAULT_PREDICTOR_HOST = "127.0.0.1";
export const DEFAULT_PREDICTOR_PORT = 18840;
export const DEFAULT_PREDICTOR_TIMEOUT_MS = 80;
export const DEFAULT_PREDICTOR_CANDIDATE_LIMIT = 12;
export const DEFAULT_PREDICTOR_MIN_CODE_LENGTH = 2;

const TSV_CONTENT_TYPE = "text/plain; charset=utf-8";
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

export function createLocalPredictorService(options = {}) {
  return new LocalPredictorService(options);
}

export async function predictForRime(input = {}, options = {}) {
  const settings = normalizePredictorSettings(options.settings);
  if (!settings.enabled) {
    return emptyPrediction("disabled");
  }

  const code = normalizeCode(input.code);
  if (code.length < settings.minCodeLength) {
    return emptyPrediction("code-too-short");
  }

  const candidates = normalizeCandidates(input.candidates)
    .slice(0, settings.candidateLimit);
  const lexicon = await readCustomPhraseLexicon({
    customPhrasePath: options.customPhrasePath ?? macCustomPhrasePath(),
    cache: options.lexiconCache
  });
  const local = buildLocalPrediction({
    code,
    candidates,
    lexicon,
    limit: settings.candidateLimit
  });

  const enLexicon = await readEnglishLexicon({
    enWordListPath: options.enWordListPath ?? DEFAULT_EN_WORD_LIST_PATH,
    cache: options.enLexiconCache
  });
  const enPrediction = buildEnglishPrediction({
    code,
    candidates,
    enLexicon,
    limit: Math.min(3, settings.candidateLimit)
  });

  const external = normalizeRunnerPrediction(options.runnerPrediction)
    ?? await maybeReadExternalPrediction({
      code,
      candidates,
      context: input.context,
      endpoint: options.externalEndpoint,
      fetchImpl: options.fetchImpl,
      timeoutMs: settings.timeoutMs
    });

  return mergePredictions(local, external, enPrediction, {
    mode: external ? "external-runner+lexicon" : "lexicon",
    code,
    model: options.model
  });
}

export function normalizePredictorSettings(input = {}) {
  const raw = input ?? {};
  return {
    enabled: raw.enabled !== false,
    host: cleanHost(raw.host ?? DEFAULT_PREDICTOR_HOST),
    port: integerRange(raw.port ?? DEFAULT_PREDICTOR_PORT, 1, 65535, "port"),
    timeoutMs: integerRange(
      raw.timeoutMs ?? raw.timeout_ms ?? DEFAULT_PREDICTOR_TIMEOUT_MS,
      20,
      1000,
      "timeoutMs"
    ),
    candidateLimit: integerRange(
      raw.candidateLimit ?? raw.candidate_limit ?? DEFAULT_PREDICTOR_CANDIDATE_LIMIT,
      3,
      30,
      "candidateLimit"
    ),
    minCodeLength: integerRange(
      raw.minCodeLength ?? raw.min_code_length ?? DEFAULT_PREDICTOR_MIN_CODE_LENGTH,
      1,
      12,
      "minCodeLength"
    ),
    runner: normalizeRunnerSettings(raw.runner)
  };
}

export async function getStandalonePredictorStatus(options = {}) {
  const settings = normalizePredictorSettings(options.settings);
  const modelState = await readModelState(options);
  const runnerStatus = options.runnerStatus ?? runnerStatusFromSettings(settings, options);
  const lexicon = await readCustomPhraseLexicon({
    customPhrasePath: options.customPhrasePath ?? macCustomPhrasePath()
  }).catch(() => ({ entries: [], summary: { entryCount: 0 } }));

  return {
    enabled: settings.enabled,
    service: options.service ?? "stopped",
    running: options.running ?? false,
    host: settings.host,
    port: settings.port,
    endpoint: `http://${settings.host}:${settings.port}`,
    timeoutMs: settings.timeoutMs,
    candidateLimit: settings.candidateLimit,
    minCodeLength: settings.minCodeLength,
    mode: runnerStatus.enabled ? `${runnerStatus.provider}+lexicon` : "lexicon",
    modelStatus: modelState.status,
    modelName: modelState.manifest?.name,
    modelDir: modelState.modelDir,
    lexiconEntryCount: lexicon.summary?.entryCount ?? lexicon.entries.length,
    runner: runnerStatus
  };
}

class LocalPredictorService {
  constructor(options = {}) {
    this.settings = normalizePredictorSettings(options.settings);
    this.customPhrasePath = options.customPhrasePath ?? macCustomPhrasePath();
    this.externalEndpoint = options.externalEndpoint ?? process.env.SANCHO_PREDICTOR_ENDPOINT;
    this.fetchImpl = options.fetchImpl;
    this.modelStateReader = options.modelStateReader ?? getLocalPredictorState;
    const runnerOptions = options.runnerOptions ?? {};
    this.runner = options.runner ?? createAsyncPredictionRunner({
      ...runnerOptions,
      endpoint: this.externalEndpoint ?? runnerOptions.endpoint,
      fetchImpl: this.fetchImpl ?? runnerOptions.fetchImpl
    });
    this.lexiconCache = {};
    this.enLexiconCache = {};
    this.server = undefined;
    this.lastError = undefined;
    this.startedAt = undefined;
  }

  async start() {
    if (this.server?.listening) {
      return await this.status();
    }

    this.server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          this.server?.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          this.server?.off("error", onError);
          resolve();
        };
        this.server.once("error", onError);
        this.server.once("listening", onListening);
        this.server.listen(this.settings.port, this.settings.host);
      });
      this.lastError = undefined;
      this.startedAt = new Date();
    } catch (error) {
      this.lastError = error;
      this.server = undefined;
    }

    return await this.status();
  }

  async stop() {
    const server = this.server;
    this.server = undefined;
    if (!server) {
      return;
    }
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
  }

  async status() {
    return await getStandalonePredictorStatus({
      settings: this.settings,
      customPhrasePath: this.customPhrasePath,
      externalEndpoint: this.externalEndpoint,
      modelStateReader: this.modelStateReader,
      runnerStatus: this.runner.status(),
      service: this.server?.listening ? "running" : this.lastError ? "error" : "stopped",
      running: Boolean(this.server?.listening),
      error: this.lastError?.message
    });
  }

  async predict(input = {}) {
    const runnerPrediction = this.runner.getCachedPrediction(input);
    const prediction = await predictForRime(input, {
      settings: this.settings,
      customPhrasePath: this.customPhrasePath,
      lexiconCache: this.lexiconCache,
      enLexiconCache: this.enLexiconCache,
      runnerPrediction
    });
    if (!["disabled", "code-too-short"].includes(prediction.mode)) {
      this.runner.schedule(input);
    }
    return prediction;
  }

  async handleRequest(request, response) {
    try {
      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
      if (request.method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, await this.status());
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/status") {
        writeJson(response, 200, await this.status());
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/predict.tsv") {
        const prediction = await this.predict({
          code: url.searchParams.get("code"),
          candidates: url.searchParams.get("candidates"),
          context: url.searchParams.get("context")
        });
        writeText(response, 200, renderPredictionTsv(prediction));
        return;
      }
      writeJson(response, 404, { error: "not-found" });
    } catch (error) {
      writeJson(response, 500, {
        error: "predictor-error",
        message: error.message
      });
    }
  }
}

async function readModelState(options = {}) {
  try {
    const reader = options.modelStateReader ?? getLocalPredictorState;
    return await reader();
  } catch (error) {
    return {
      status: "missing",
      error,
      manifest: {},
      modelDir: ""
    };
  }
}

async function readCustomPhraseLexicon(options = {}) {
  const path = options.customPhrasePath;
  const cache = options.cache;
  const fileStat = await stat(path).catch((error) => {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  const cacheKey = path;
  const mtimeMs = fileStat?.mtimeMs ?? 0;
  if (cache?.[cacheKey]?.mtimeMs === mtimeMs) {
    return cache[cacheKey].lexicon;
  }

  const content = fileStat ? await readFile(path, "utf8") : "";
  const parsed = parseCustomPhraseText(content);
  const lexicon = {
    ...parsed,
    entries: parsed.entries.map((entry) => ({
      ...entry,
      text: entry.preview ?? entry.surface
    }))
  };
  if (cache) {
    cache[cacheKey] = { mtimeMs, lexicon };
  }
  return lexicon;
}

async function readEnglishLexicon(options = {}) {
  const path = options.enWordListPath;
  const cache = options.cache;
  const fileStat = await stat(path).catch((error) => {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  const cacheKey = path;
  const mtimeMs = fileStat?.mtimeMs ?? 0;
  if (cache?.[cacheKey]?.mtimeMs === mtimeMs) {
    return cache[cacheKey].lexicon;
  }

  const words = fileStat
    ? JSON.parse(await readFile(path, "utf8")).words ?? []
    : [];
  const byPrefix = new Map();
  for (const word of words) {
    const key = word.slice(0, 1);
    let bucket = byPrefix.get(key);
    if (!bucket) {
      bucket = [];
      byPrefix.set(key, bucket);
    }
    bucket.push(word);
  }
  const lexicon = { byPrefix, wordCount: words.length };
  if (cache) {
    cache[cacheKey] = { mtimeMs, lexicon };
  }
  return lexicon;
}

function buildEnglishPrediction(input) {
  const code = input.code;
  if (!code || code.length < 3) {
    return { suggestions: [] };
  }
  const byPrefix = input.enLexicon?.byPrefix;
  if (!byPrefix) {
    return { suggestions: [] };
  }

  const bucket = byPrefix.get(code.slice(0, 1));
  if (!bucket) {
    return { suggestions: [] };
  }

  const existingTexts = new Set(input.candidates.map((candidate) => candidate.text.toLowerCase()));
  const scored = [];
  for (const word of bucket) {
    if (!word.startsWith(code)) {
      continue;
    }
    if (existingTexts.has(word)) {
      continue;
    }
    const score = 100000 + word.length - (word.length - code.length) * 50;
    scored.push({ text: word, score, comment: "EN" });
  }
  scored.sort((a, b) => b.score - a.score);

  const suggestions = [];
  const limit = input.limit ?? 3;
  for (const item of scored) {
    if (suggestions.length >= limit) {
      break;
    }
    suggestions.push(item);
  }

  return { suggestions };
}

function buildLocalPrediction(input) {
  const rank = [];
  const suggestions = [];
  const code = input.code;
  const existingTexts = new Set(input.candidates.map((candidate) => candidate.text));
  const matchingEntries = input.lexicon.entries
    .map((entry) => ({
      entry,
      score: scoreLexiconEntry(entry, code)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const candidate of input.candidates) {
    const exactMatches = matchingEntries.filter((item) => item.entry.text === candidate.text);
    if (exactMatches.length === 0) {
      continue;
    }
    const score = exactMatches.reduce((total, item) => total + item.score, 0);
    rank.push({
      text: candidate.text,
      score,
      comment: "Sancho"
    });
  }

  for (const item of matchingEntries) {
    const text = item.entry.text;
    if (existingTexts.has(text) || suggestions.some((suggestion) => suggestion.text === text)) {
      continue;
    }
    suggestions.push({
      text,
      score: item.score,
      comment: item.entry.source === "managed" ? "Sancho 托管" : "Sancho 词库",
      code: item.entry.code,
      position: item.entry.candidatePosition
    });
    if (suggestions.length >= 3) {
      break;
    }
  }

  return {
    mode: "lexicon",
    rank,
    suggestions,
    diagnostics: {
      lexiconEntryCount: input.lexicon.entries.length
    }
  };
}

function scoreLexiconEntry(entry, code) {
  const entryCode = normalizeCode(entry.code);
  if (!entryCode) {
    return 0;
  }
  const base = Math.max(1, Number(entry.weight) || 1);
  if (entryCode === code) {
    return 200000 + base;
  }
  if (entry.source === "managed") {
    return 0;
  }
  if (entryCode.startsWith(code)) {
    return 120000 + base - ((entryCode.length - code.length) * 100);
  }
  if (code.startsWith(entryCode)) {
    return 70000 + base - ((code.length - entryCode.length) * 60);
  }
  return 0;
}

async function maybeReadExternalPrediction(options) {
  if (!options.endpoint || !options.fetchImpl && typeof fetch !== "function") {
    return undefined;
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetchImpl(options.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: options.code,
        candidates: options.candidates.map((candidate) => candidate.text),
        context: options.context ?? ""
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      return undefined;
    }
    return normalizeExternalPrediction(await response.json());
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeExternalPrediction(input) {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const rank = normalizePredictionRows(
    input.rank ?? input.rankedCandidates ?? input.ranked_candidates,
    { defaultComment: "AI 重排" }
  );
  const suggestions = normalizePredictionRows(
    input.suggestions ?? input.predict ?? [],
    { defaultComment: "AI 预测" }
  );
  if (rank.length === 0 && suggestions.length === 0) {
    return undefined;
  }
  return {
    mode: "external-runner",
    rank,
    suggestions
  };
}

function normalizePredictionRows(input, options = {}) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => {
      const raw = typeof item === "string" ? { text: item } : item;
      const text = cleanText(raw?.text ?? raw?.candidate ?? raw?.surface);
      if (!text) {
        return undefined;
      }
      return {
        text,
        score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : 100000,
        comment: normalizeAiComment(raw.comment, options.defaultComment ?? "Sancho AI"),
        code: cleanText(raw.code),
        position: normalizeCandidatePosition(raw.position ?? raw.candidatePosition ?? raw.candidate_position)
      };
    })
    .filter(Boolean);
}

function normalizeCandidatePosition(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const position = Number(value);
  return Number.isInteger(position) && position >= 1 && position <= 9
    ? position
    : undefined;
}

function normalizeAiComment(value, fallback) {
  const text = cleanText(value);
  if (!text || text.toLowerCase() === "ai" || text === "Sancho AI") {
    return fallback;
  }
  return text.includes("AI") ? text : `${fallback} ${text}`;
}

function mergePredictions(local, external, enPrediction, options) {
  const rankByText = new Map();
  for (const row of local.rank) {
    rankByText.set(row.text, row);
  }
  for (const row of external?.rank ?? []) {
    const current = rankByText.get(row.text);
    const comment = normalizeAiComment(row.comment, "AI 重排");
    rankByText.set(row.text, {
      ...row,
      score: (current?.score ?? 0) + row.score + 100000,
      comment: comment ?? current?.comment ?? "AI 重排"
    });
  }

  const suggestions = [];
  const seenSuggestions = new Set();
  for (const row of [...(external?.suggestions ?? []), ...(enPrediction?.suggestions ?? []), ...local.suggestions]) {
    if (seenSuggestions.has(row.text)) {
      continue;
    }
    seenSuggestions.add(row.text);
    suggestions.push({
      ...row,
      comment: external?.suggestions?.includes(row)
        ? normalizeAiComment(row.comment, "AI 预测")
        : row.comment
    });
  }

  return {
    mode: enPrediction?.suggestions?.length
      ? `${options.mode}+en`
      : options.mode,
    code: options.code,
    rank: Array.from(rankByText.values()).sort((a, b) => b.score - a.score),
    suggestions: suggestions.slice(0, 3),
    diagnostics: {
      ...(local.diagnostics ?? {}),
      external: Boolean(external),
      enWordsAvailable: enPrediction?.suggestions?.length > 0,
      modelStatus: options.model?.status
    }
  };
}

function emptyPrediction(reason) {
  return {
    mode: reason,
    rank: [],
    suggestions: [],
    diagnostics: {}
  };
}

function renderPredictionTsv(prediction) {
  const lines = [
    `# sancho-predictor-v1\t${tsv(prediction.mode)}`
  ];
  for (const row of prediction.suggestions) {
    lines.push([
      "suggest",
      row.text,
      String(Math.round(row.score)),
      row.comment ?? "Sancho",
      row.code ?? "",
      row.position ?? ""
    ].map(tsv).join("\t"));
  }
  for (const row of prediction.rank) {
    lines.push([
      "rank",
      row.text,
      String(Math.round(row.score)),
      row.comment ?? "Sancho",
      row.code ?? "",
      row.position ?? ""
    ].map(tsv).join("\t"));
  }
  return `${lines.join("\n")}\n`;
}

function normalizeCode(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9;'.]/g, "");
}

function normalizeCandidates(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeCandidate).filter((candidate) => candidate.text);
  }
  return String(value ?? "")
    .split(/\n|\|/)
    .map((text) => normalizeCandidate(text))
    .filter((candidate) => candidate.text);
}

function normalizeCandidate(value) {
  if (value && typeof value === "object") {
    return { text: cleanText(value.text ?? value.candidate ?? value.surface) };
  }
  return { text: cleanText(value) };
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .trim();
}

function integerRange(value, min, max, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`Invalid predictor setting ${name}: ${value}`);
  }
  return number;
}

function cleanHost(value) {
  const host = String(value ?? "").trim();
  if (!host || /[\s/]/.test(host)) {
    throw new Error(`Invalid predictor host: ${value}`);
  }
  return host;
}

function normalizeRunnerSettings(input = {}) {
  const raw = input ?? {};
  const provider = String(raw.provider ?? "none").trim().toLowerCase();
  return {
    provider: ["none", "http", "ollama"].includes(provider) ? provider : "none",
    endpoint: cleanOptionalString(raw.endpoint),
    ollamaModel: cleanOptionalString(raw.ollamaModel ?? raw.ollama_model),
    ollamaEndpoint: cleanOptionalString(raw.ollamaEndpoint ?? raw.ollama_endpoint),
    timeoutMs: raw.timeoutMs === undefined && raw.timeout_ms === undefined
      ? undefined
      : integerRange(raw.timeoutMs ?? raw.timeout_ms, 1000, 30000, "runner.timeoutMs")
  };
}

function cleanOptionalString(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function runnerStatusFromSettings(settings, options) {
  if (options.externalEndpoint) {
    return {
      provider: "http",
      enabled: true,
      configured: true,
      endpoint: options.externalEndpoint
    };
  }
  const runner = settings.runner ?? {};
  if (runner.provider === "http") {
    return {
      provider: "http",
      enabled: Boolean(runner.endpoint),
      configured: Boolean(runner.endpoint),
      endpoint: runner.endpoint,
      timeoutMs: runner.timeoutMs
    };
  }
  if (runner.provider === "ollama") {
    return {
      provider: "ollama",
      enabled: Boolean(runner.ollamaModel),
      configured: Boolean(runner.ollamaModel),
      endpoint: runner.ollamaEndpoint,
      model: runner.ollamaModel,
      timeoutMs: runner.timeoutMs
    };
  }
  return {
    provider: "none",
    enabled: false,
    configured: false
  };
}

function tsv(value) {
  return String(value ?? "").replace(/[\t\r\n]/g, " ");
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": JSON_CONTENT_TYPE });
  response.end(`${JSON.stringify(payload)}\n`);
}

function writeText(response, statusCode, text) {
  response.writeHead(statusCode, { "content-type": TSV_CONTENT_TYPE });
  response.end(text);
}
