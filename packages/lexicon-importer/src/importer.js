import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

export const SUPPORTED_FORMATS = [
  "rime-custom-phrase",
  "rime-dict",
  "tsv",
  "csv"
];

export const EXTERNAL_ADAPTERS = {
  imewlconverter: {
    licenseBoundary: "external-process",
    sourceFormats: [
      "sogou-scel",
      "sogou-text",
      "qq-pinyin",
      "baidu-ime",
      "microsoft-pinyin",
      "macos-text-replacements"
    ]
  }
};

export const DEFAULT_WEIGHT = 100;

const MAX_WEIGHT = 999999;
const IMPORT_SCHEMA = "sancho.lexicon.import.v1";
const ROLLBACK_SCHEMA = "sancho.lexicon.rollback.v1";
const DEFAULT_EXTERNAL_MAX_BUFFER = 10 * 1024 * 1024;
const execFileAsync = promisify(execFile);

export function parseLexiconText(text, options = {}) {
  if (typeof text !== "string") {
    throw new TypeError("Lexicon content must be a string.");
  }

  const format = requireSupportedFormat(options.format);
  if (format === "rime-custom-phrase") {
    return parseRimeRows(text, {
      ...options,
      format,
      startAtDictBody: false
    });
  }
  if (format === "rime-dict") {
    return parseRimeRows(text, {
      ...options,
      format,
      startAtDictBody: true
    });
  }
  return parseDelimitedText(text, options);
}

export function createImportPreview(options = {}) {
  const format = requireSupportedFormat(options.format);
  const source = normalizeSource(options.sourceId ?? options.source ?? "manual-import");
  const parsed = parseLexiconText(options.text, {
    format,
    source,
    defaultWeight: options.defaultWeight
  });
  const merged = mergeLexiconEntries(parsed.entries);

  return {
    format,
    source,
    summary: {
      parsedRows: parsed.parsedRows,
      acceptedRows: parsed.entries.length,
      rejectedRows: parsed.rejectedRows.length,
      duplicateRows: merged.duplicates.length,
      importedEntries: merged.entries.length
    },
    entries: merged.entries,
    duplicates: merged.duplicates,
    rejectedRows: parsed.rejectedRows
  };
}

export async function previewLexiconFile(options = {}) {
  const inputPath = requirePath(options.inputPath, "inputPath");
  const text = await readFile(inputPath, "utf8");
  return createImportPreview({
    ...options,
    text,
    sourceId: options.sourceId ?? options.source ?? basename(inputPath)
  });
}

export async function importLexiconFile(options = {}) {
  const outputPath = requirePath(options.outputPath, "outputPath");
  const preview = await previewLexiconFile(options);
  return writeImportPreview(outputPath, preview, options);
}

export async function previewExternalLexiconFile(options = {}) {
  const inputPath = requirePath(options.inputPath, "inputPath");
  const adapter = requireExternalAdapter(options.adapter);
  const sourceFormat = requireExternalSourceFormat(adapter, options.sourceFormat);
  const convertedFormat = requireSupportedFormat(options.convertedFormat ?? options.format);
  const conversion = await runExternalAdapter({
    adapter,
    inputPath,
    toolPath: options.toolPath,
    adapterArgs: options.adapterArgs,
    execFileImpl: options.execFileImpl,
    maxBuffer: options.maxBuffer
  });

  const preview = createImportPreview({
    text: conversion.text,
    format: convertedFormat,
    sourceId: options.sourceId ?? options.source ?? basename(inputPath),
    defaultWeight: options.defaultWeight
  });

  return {
    ...preview,
    adapter: {
      adapter,
      sourceFormat,
      convertedFormat,
      licenseBoundary: EXTERNAL_ADAPTERS[adapter].licenseBoundary
    }
  };
}

export async function importExternalLexiconFile(options = {}) {
  const outputPath = requirePath(options.outputPath, "outputPath");
  const preview = await previewExternalLexiconFile(options);
  return writeImportPreview(outputPath, preview, options);
}

async function writeImportPreview(outputPath, preview, options) {
  const generatedAt = new Date().toISOString();
  const document = {
    schema: IMPORT_SCHEMA,
    generatedAt,
    source: preview.source,
    format: preview.format,
    summary: preview.summary,
    entries: preview.entries
  };
  if (preview.adapter) {
    document.adapter = preview.adapter;
  }

  if (options.dryRun) {
    return {
      changed: true,
      dryRun: true,
      outputPath,
      rollback: null,
      document,
      preview
    };
  }

  const rollback = await createRollbackSnapshot(outputPath, options.rollbackDir);
  await atomicWriteText(outputPath, `${JSON.stringify(document, null, 2)}\n`);

  return {
    changed: true,
    dryRun: false,
    outputPath,
    rollback,
    document,
    preview
  };
}

async function runExternalAdapter(options) {
  const toolPath = options.toolPath ?? options.adapter;
  if (typeof toolPath !== "string" || toolPath.trim() === "") {
    throw new Error("Missing external adapter tool path.");
  }
  const adapterArgs = requireAdapterArgs(options.adapterArgs);
  const temporaryDir = adapterArgs.some((arg) => String(arg).includes("{output}"))
    ? await mkdtemp(join(tmpdir(), "sancho-lexicon-adapter-"))
    : null;
  const outputPath = temporaryDir ? join(temporaryDir, "converted.lexicon") : null;
  const expandedArgs = adapterArgs.map((arg) => String(arg)
    .replaceAll("{input}", options.inputPath)
    .replaceAll("{output}", outputPath ?? ""));
  const execFileImpl = options.execFileImpl ?? execFileAsync;

  try {
    const result = await execFileImpl(toolPath, expandedArgs, {
      encoding: "utf8",
      maxBuffer: options.maxBuffer ?? DEFAULT_EXTERNAL_MAX_BUFFER,
      shell: false
    });
    const text = outputPath
      ? await readFile(outputPath, "utf8")
      : normalizeAdapterStdout(result?.stdout);
    return { text, toolPath };
  } catch (error) {
    const exitCode = error && typeof error === "object" && "code" in error
      ? error.code
      : "unknown";
    throw new Error(`External lexicon adapter ${options.adapter} failed with exit code ${exitCode}.`);
  } finally {
    if (temporaryDir) {
      await rm(temporaryDir, { recursive: true, force: true });
    }
  }
}

export async function rollbackImport(options = {}) {
  const outputPath = requirePath(options.outputPath, "outputPath");
  const rollbackId = cleanIdentifier(options.rollbackId, "rollbackId");
  const snapshotPath = join(resolveRollbackDir(outputPath, options.rollbackDir), `${rollbackId}.json`);
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));

  if (snapshot.schema !== ROLLBACK_SCHEMA) {
    throw new Error(`Unsupported rollback snapshot schema: ${snapshot.schema}`);
  }

  const result = {
    changed: true,
    dryRun: Boolean(options.dryRun),
    outputPath,
    rollbackId,
    restoredExistingFile: snapshot.existed
  };

  if (options.dryRun) {
    return result;
  }

  if (snapshot.existed) {
    await copyFile(snapshot.contentPath, outputPath);
  } else {
    await rm(outputPath, { force: true });
  }

  return result;
}

export function mergeLexiconEntries(entries, options = {}) {
  if (!Array.isArray(entries)) {
    throw new TypeError("Lexicon entries must be an array.");
  }

  const duplicatePolicy = options.duplicatePolicy ?? "max-weight";
  if (duplicatePolicy !== "max-weight") {
    throw new Error(`Unsupported duplicate policy: ${duplicatePolicy}`);
  }

  const byKey = new Map();
  const duplicates = [];

  for (const rawEntry of entries) {
    const entry = normalizeLexiconEntry(rawEntry);
    const key = `${entry.surface}\0${entry.reading}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, entry);
      continue;
    }

    const mergedTags = mergeTags(existing.style_tags, entry.style_tags);
    const keepIncoming = entry.weight >= existing.weight;
    const kept = keepIncoming ? entry : existing;
    const dropped = keepIncoming ? existing : entry;

    const nextEntry = {
      ...kept,
      style_tags: mergedTags
    };
    const domain = kept.domain ?? dropped.domain;
    if (domain !== undefined) {
      nextEntry.domain = domain;
    }

    byKey.set(key, nextEntry);
    duplicates.push({
      surface: entry.surface,
      reading: entry.reading,
      keptWeight: keepIncoming ? entry.weight : existing.weight,
      droppedWeight: keepIncoming ? existing.weight : entry.weight
    });
  }

  return {
    entries: Array.from(byKey.values()),
    duplicates
  };
}

export function normalizeLexiconEntry(input, defaults = {}) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Lexicon entry must be an object.");
  }

  const source = normalizeSource(input.source ?? defaults.source ?? "manual-import");
  const entry = {
    surface: cleanTextField(input.surface ?? input.text ?? input.phrase, "surface"),
    reading: cleanTextField(input.reading ?? input.code ?? input.pinyin, "reading"),
    weight: normalizeWeight(input.weight ?? defaults.defaultWeight ?? DEFAULT_WEIGHT),
    source,
    style_tags: normalizeStyleTags(input.style_tags ?? input.styleTags ?? defaults.style_tags)
  };

  const domain = input.domain ?? defaults.domain;
  if (domain !== undefined && domain !== null && String(domain).trim() !== "") {
    entry.domain = cleanTextField(domain, "domain");
  }

  return entry;
}

function parseRimeRows(text, options) {
  const source = normalizeSource(options.source ?? options.sourceId ?? "rime-import");
  const defaultWeight = options.defaultWeight ?? DEFAULT_WEIGHT;
  const lines = text.split(/\r?\n/);
  const bodyStart = options.startAtDictBody ? findRimeDictBodyStart(lines) : 0;
  const entries = [];
  const rejectedRows = [];
  let parsedRows = 0;

  for (let index = bodyStart; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      continue;
    }

    parsedRows += 1;
    const columns = line.split("\t").map((column) => column.trim());
    if (columns.length < 2 || columns.length > 3) {
      rejectedRows.push({
        line: lineNumber,
        reason: "Expected surface, reading, and optional weight columns."
      });
      continue;
    }

    try {
      entries.push(normalizeLexiconEntry({
        surface: columns[0],
        reading: columns[1],
        weight: columns[2] || defaultWeight,
        source
      }, { defaultWeight, source }));
    } catch (error) {
      rejectedRows.push({
        line: lineNumber,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { entries, rejectedRows, parsedRows };
}

function parseDelimitedText(text, options) {
  const format = requireSupportedFormat(options.format);
  const delimiter = format === "csv" ? "," : "\t";
  const source = normalizeSource(options.source ?? options.sourceId ?? `${format}-import`);
  const defaultWeight = options.defaultWeight ?? DEFAULT_WEIGHT;
  const rows = parseSeparatedRows(text, delimiter)
    .filter((row) => row.fields.some((field) => field.trim() !== ""));
  const header = detectHeader(rows[0]?.fields);
  const dataRows = header ? rows.slice(1) : rows;
  const entries = [];
  const rejectedRows = [];
  let parsedRows = 0;

  for (const row of dataRows) {
    parsedRows += 1;
    const rawEntry = header
      ? entryFromHeader(row.fields, header)
      : {
          surface: row.fields[0],
          reading: row.fields[1],
          weight: row.fields[2],
          source: row.fields[3] || source,
          domain: row.fields[4],
          style_tags: row.fields[5]
        };

    try {
      entries.push(normalizeLexiconEntry(rawEntry, { defaultWeight, source }));
    } catch (error) {
      rejectedRows.push({
        line: row.line,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { entries, rejectedRows, parsedRows };
}

function findRimeDictBodyStart(lines) {
  const markerIndex = lines.findIndex((line) => line.trim() === "...");
  return markerIndex === -1 ? 0 : markerIndex + 1;
}

function parseSeparatedRows(text, delimiter) {
  const rows = [];
  let fields = [""];
  let line = 1;
  let rowLine = 1;
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        fields[fields.length - 1] += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      fields.push("");
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      rows.push({ line: rowLine, fields });
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      line += 1;
      rowLine = line;
      fields = [""];
      continue;
    }

    fields[fields.length - 1] += char;
  }

  if (fields.length > 1 || fields[0] !== "") {
    rows.push({ line: rowLine, fields });
  }

  return rows;
}

function detectHeader(fields) {
  if (!fields) {
    return null;
  }

  const header = new Map();
  fields.forEach((field, index) => {
    const key = canonicalHeaderName(field);
    if (key) {
      header.set(key, index);
    }
  });

  if (!header.has("surface") || !header.has("reading")) {
    return null;
  }
  return header;
}

function entryFromHeader(fields, header) {
  return {
    surface: valueAt(fields, header, "surface"),
    reading: valueAt(fields, header, "reading"),
    weight: valueAt(fields, header, "weight"),
    source: valueAt(fields, header, "source"),
    domain: valueAt(fields, header, "domain"),
    style_tags: valueAt(fields, header, "style_tags")
  };
}

function valueAt(fields, header, name) {
  const index = header.get(name);
  return index === undefined ? undefined : fields[index];
}

function canonicalHeaderName(field) {
  const key = String(field).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["surface", "text", "phrase", "word", "term", "candidate"].includes(key)) {
    return "surface";
  }
  if (["reading", "code", "pinyin", "shortcut", "key"].includes(key)) {
    return "reading";
  }
  if (["weight", "frequency", "freq", "score"].includes(key)) {
    return "weight";
  }
  if (["source", "source_id"].includes(key)) {
    return "source";
  }
  if (key === "domain") {
    return "domain";
  }
  if (["style_tags", "styletags", "tags"].includes(key)) {
    return "style_tags";
  }
  return null;
}

async function createRollbackSnapshot(outputPath, rollbackDir) {
  const resolvedRollbackDir = resolveRollbackDir(outputPath, rollbackDir);
  const rollbackId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
  const snapshotPath = join(resolvedRollbackDir, `${rollbackId}.json`);
  const contentPath = join(resolvedRollbackDir, `${rollbackId}.previous`);
  await mkdir(resolvedRollbackDir, { recursive: true });

  let existed = true;
  try {
    await copyFile(outputPath, contentPath);
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw error;
    }
    existed = false;
  }

  const snapshot = {
    schema: ROLLBACK_SCHEMA,
    createdAt: new Date().toISOString(),
    outputName: basename(outputPath),
    existed,
    contentPath: existed ? contentPath : null
  };
  await atomicWriteText(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  return {
    rollbackId,
    snapshotPath,
    restoredExistingFile: existed
  };
}

function resolveRollbackDir(outputPath, rollbackDir) {
  return rollbackDir ?? join(dirname(outputPath), ".sancho-lexicon-rollback");
}

async function atomicWriteText(path, content) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });
  const temporaryPath = join(directory, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, path);
}

function requireSupportedFormat(format) {
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new Error(
      `Unsupported lexicon format: ${format ?? "(missing)"}. Supported formats: ${SUPPORTED_FORMATS.join(", ")}.`
    );
  }
  return format;
}

function requireExternalAdapter(adapter) {
  if (!Object.hasOwn(EXTERNAL_ADAPTERS, adapter)) {
    throw new Error(
      `Unsupported external lexicon adapter: ${adapter ?? "(missing)"}. Supported adapters: ${Object.keys(EXTERNAL_ADAPTERS).join(", ")}.`
    );
  }
  return adapter;
}

function requireExternalSourceFormat(adapter, sourceFormat) {
  const cleaned = cleanIdentifier(sourceFormat, "sourceFormat");
  const supported = EXTERNAL_ADAPTERS[adapter].sourceFormats;
  if (!supported.includes(cleaned)) {
    throw new Error(`Unsupported source format for ${adapter}: ${cleaned}. Supported source formats: ${supported.join(", ")}.`);
  }
  return cleaned;
}

function requireAdapterArgs(adapterArgs) {
  if (!Array.isArray(adapterArgs) || adapterArgs.length === 0) {
    throw new Error("External adapter args must be a non-empty array.");
  }
  if (!adapterArgs.some((arg) => String(arg).includes("{input}"))) {
    throw new Error("External adapter args must include the {input} token.");
  }
  return adapterArgs;
}

function normalizeAdapterStdout(stdout) {
  if (typeof stdout === "string") {
    return stdout;
  }
  if (Buffer.isBuffer(stdout)) {
    return stdout.toString("utf8");
  }
  return String(stdout ?? "");
}

function requirePath(path, name) {
  if (typeof path !== "string" || path.trim() === "") {
    throw new Error(`Missing required ${name}.`);
  }
  return path;
}

function normalizeSource(value) {
  return cleanTextField(value, "source");
}

function cleanTextField(value, name) {
  if (typeof value !== "string") {
    throw new TypeError(`Lexicon ${name} must be a string.`);
  }

  const cleaned = value.trim();
  if (cleaned.length === 0) {
    throw new Error(`Lexicon ${name} must not be empty.`);
  }
  if (cleaned.includes("\t") || cleaned.includes("\n") || cleaned.includes("\r")) {
    throw new Error(`Lexicon ${name} must not contain tabs or line breaks.`);
  }
  return cleaned;
}

function normalizeWeight(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_WEIGHT;
  }

  const weight = Number(value);
  if (!Number.isInteger(weight) || weight < 0 || weight > MAX_WEIGHT) {
    throw new Error(`Lexicon weight must be an integer from 0 to ${MAX_WEIGHT}.`);
  }
  return weight;
}

function normalizeStyleTags(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  const rawTags = Array.isArray(value)
    ? value
    : String(value).split(/[|,]/);
  const tags = rawTags
    .map((tag) => cleanTextField(String(tag), "style tag"))
    .filter(Boolean);
  return Array.from(new Set(tags));
}

function mergeTags(left = [], right = []) {
  return Array.from(new Set([...left, ...right]));
}

function cleanIdentifier(value, name) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}
