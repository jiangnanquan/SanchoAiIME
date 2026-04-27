import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  writeFile
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";

export const MANAGED_REGION_NAME = "quick-dictionary";
export const BEGIN_MARKER = "# >>> SanchoAiIME managed: quick-dictionary";
export const END_MARKER = "# <<< SanchoAiIME managed: quick-dictionary";

const DEFAULT_WEIGHT = 99;
const MAX_WEIGHT = 999999;

export function defaultCustomPhrasePath(home = homedir()) {
  return join(home, "Library", "Rime", "custom_phrase.txt");
}

export function detectLineEnding(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

export function normalizeEntry(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Quick dictionary entry must be an object.");
  }

  const surface = cleanTextField(
    input.surface ?? input.text ?? input.phrase,
    "surface"
  );
  const code = cleanTextField(input.code ?? input.reading, "code");
  const weight = normalizeWeight(input.weight ?? DEFAULT_WEIGHT);

  return { surface, code, weight };
}

export function normalizeEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError("Quick dictionary entries must be an array.");
  }

  const byEntryKey = new Map();
  for (const rawEntry of entries) {
    const entry = normalizeEntry(rawEntry);
    const key = `${entry.surface}\0${entry.code}`;
    byEntryKey.delete(key);
    byEntryKey.set(key, entry);
  }
  return Array.from(byEntryKey.values());
}

export function renderEntry(entry) {
  const normalized = normalizeEntry(entry);
  return `${normalized.surface}\t${normalized.code}\t${normalized.weight}`;
}

export function renderManagedRegion(entries, options = {}) {
  const lineEnding = options.lineEnding ?? "\n";
  const lines = [
    BEGIN_MARKER,
    ...normalizeEntries(entries).map(renderEntry),
    END_MARKER
  ];
  return `${lines.join(lineEnding)}${lineEnding}`;
}

export function updateManagedRegion(existingText, entries) {
  if (typeof existingText !== "string") {
    throw new TypeError("Existing custom phrase content must be a string.");
  }

  assertMarkerState(existingText);

  const lineEnding = detectLineEnding(existingText);
  const managedRegion = renderManagedRegion(entries, { lineEnding });
  const begin = existingText.indexOf(BEGIN_MARKER);
  const end = existingText.indexOf(END_MARKER);

  if (begin === -1 && end === -1) {
    if (existingText.length === 0) {
      return managedRegion;
    }

    const separator = existingText.endsWith("\n") ? "" : lineEnding;
    return `${existingText}${separator}${managedRegion}`;
  }

  const replaceEnd = endOfMarkerLine(existingText, end);
  return `${existingText.slice(0, begin)}${managedRegion}${existingText.slice(replaceEnd)}`;
}

export async function loadEntriesFromJsonFile(path) {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed)
    ? parsed
    : parsed.entries ?? parsed.phrases ?? parsed.quickDictionary;

  return normalizeEntries(entries);
}

export async function syncCustomPhraseFile(options) {
  const customPhrasePath = options.customPhrasePath ?? defaultCustomPhrasePath();
  const entries = normalizeEntries(options.entries);
  const existingText = await readUtf8IfExists(customPhrasePath);
  const nextText = updateManagedRegion(existingText, entries);

  if (options.dryRun) {
    return {
      changed: existingText !== nextText,
      content: nextText,
      entries,
      path: customPhrasePath
    };
  }

  if (existingText !== nextText) {
    await atomicWriteText(customPhrasePath, nextText);
  }

  return {
    changed: existingText !== nextText,
    entries,
    path: customPhrasePath
  };
}

async function readUtf8IfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function atomicWriteText(path, content) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });

  const temporaryPath = join(
    directory,
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`
  );
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, path);
}

function cleanTextField(value, name) {
  if (typeof value !== "string") {
    throw new TypeError(`Quick dictionary ${name} must be a string.`);
  }

  const cleaned = value.trim();
  if (cleaned.length === 0) {
    throw new Error(`Quick dictionary ${name} must not be empty.`);
  }
  if (cleaned.includes("\t") || cleaned.includes("\n") || cleaned.includes("\r")) {
    throw new Error(`Quick dictionary ${name} must not contain tabs or line breaks.`);
  }
  return cleaned;
}

function normalizeWeight(value) {
  const weight = Number(value);
  if (!Number.isInteger(weight) || weight < 0 || weight > MAX_WEIGHT) {
    throw new Error(
      `Quick dictionary weight must be an integer from 0 to ${MAX_WEIGHT}.`
    );
  }
  return weight;
}

function assertMarkerState(text) {
  const beginCount = countOccurrences(text, BEGIN_MARKER);
  const endCount = countOccurrences(text, END_MARKER);

  if (beginCount !== endCount) {
    throw new Error("Malformed managed region: begin/end marker count differs.");
  }
  if (beginCount > 1) {
    throw new Error("Malformed managed region: multiple managed regions found.");
  }
  if (beginCount === 1 && text.indexOf(BEGIN_MARKER) > text.indexOf(END_MARKER)) {
    throw new Error("Malformed managed region: end marker appears before begin marker.");
  }
}

function countOccurrences(text, needle) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = text.indexOf(needle, offset);
    if (index === -1) {
      return count;
    }
    count += 1;
    offset = index + needle.length;
  }
}

function endOfMarkerLine(text, markerIndex) {
  const markerEnd = markerIndex + END_MARKER.length;
  if (text.slice(markerEnd, markerEnd + 2) === "\r\n") {
    return markerEnd + 2;
  }
  if (text.slice(markerEnd, markerEnd + 1) === "\n") {
    return markerEnd + 1;
  }
  return markerEnd;
}
