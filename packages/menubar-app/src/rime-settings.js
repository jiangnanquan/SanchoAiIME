import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { macRimeDirectory } from "./platform.js";
import {
  readRimePredictorSettings,
  writeRimePredictorIntegration
} from "./rime-predictor-integration.js";

export const RIME_SETTING_OPTIONS = Object.freeze({
  outputScripts: ["simplified", "traditional"],
  candidateLayouts: ["stacked", "linear"],
  textOrientations: ["horizontal", "vertical"],
  colorSchemes: [
    "sancho_mist",
    "sancho_graphite",
    "sancho_paper",
    "sancho_ocean",
    "sancho_custom",
    "native",
    "clean_white",
    "mojave_dark",
    "aqua",
    "ink",
    "luna",
    "apathy"
  ],
  pageSize: { min: 3, max: 9 },
  fontPoint: { min: 12, max: 24 },
  cornerRadius: { min: 0, max: 16 }
});

export const SANCHO_SKIN_PRESETS = Object.freeze({
  sancho_mist: Object.freeze({
    name: "Sancho Mist",
    backColor: "#F7FAFC",
    borderColor: "#D9E2EC",
    textColor: "#1F2933",
    candidateTextColor: "#243B53",
    commentTextColor: "#829AB1",
    labelColor: "#627D98",
    highlightedBackColor: "#147D64",
    highlightedTextColor: "#FFFFFF",
    highlightedLabelColor: "#D8FFF2",
    highlightedCommentColor: "#C6F7E2"
  }),
  sancho_graphite: Object.freeze({
    name: "Sancho Graphite",
    backColor: "#171A1F",
    borderColor: "#2B3138",
    textColor: "#E6EDF3",
    candidateTextColor: "#D0D7DE",
    commentTextColor: "#8B949E",
    labelColor: "#8B949E",
    highlightedBackColor: "#2F8F7B",
    highlightedTextColor: "#FFFFFF",
    highlightedLabelColor: "#DDFCF2",
    highlightedCommentColor: "#B9E9DD"
  }),
  sancho_paper: Object.freeze({
    name: "Sancho Paper",
    backColor: "#FFFCF5",
    borderColor: "#E5DDD0",
    textColor: "#20262D",
    candidateTextColor: "#2E3A46",
    commentTextColor: "#7A8490",
    labelColor: "#6B7280",
    highlightedBackColor: "#2E6F9E",
    highlightedTextColor: "#FFFFFF",
    highlightedLabelColor: "#EAF6FF",
    highlightedCommentColor: "#D3EBFA"
  }),
  sancho_ocean: Object.freeze({
    name: "Sancho Ocean",
    backColor: "#F2F8FB",
    borderColor: "#C9DCE6",
    textColor: "#152A38",
    candidateTextColor: "#24495C",
    commentTextColor: "#6B8794",
    labelColor: "#486C7D",
    highlightedBackColor: "#0F6C81",
    highlightedTextColor: "#FFFFFF",
    highlightedLabelColor: "#D8F5FB",
    highlightedCommentColor: "#BEE9F3"
  })
});

export const DEFAULT_CUSTOM_SKIN = Object.freeze({
  name: "Sancho Custom",
  backColor: "#F7FAFC",
  borderColor: "#D9E2EC",
  textColor: "#1F2933",
  candidateTextColor: "#243B53",
  commentTextColor: "#829AB1",
  labelColor: "#627D98",
  highlightedBackColor: "#147D64",
  highlightedTextColor: "#FFFFFF",
  highlightedLabelColor: "#D8FFF2",
  highlightedCommentColor: "#C6F7E2"
});

export const DEFAULT_RIME_SETTINGS = Object.freeze({
  outputScript: "simplified",
  candidateLayout: "stacked",
  textOrientation: "horizontal",
  colorScheme: "sancho_mist",
  pageSize: 5,
  fontPoint: 16,
  cornerRadius: 7,
  inlinePreedit: true,
  englishPunctuation: false,
  customSkin: DEFAULT_CUSTOM_SKIN,
  predictor: {
    enabled: true,
    port: 18840,
    timeoutMs: 80,
    candidateLimit: 12,
    minCodeLength: 2,
    mixedInput: true,
    runner: {
      provider: "none"
    }
  }
});

const SQUIRREL_EXECUTABLE = "/Library/Input Methods/Squirrel.app/Contents/MacOS/Squirrel";
const RIME_DEPLOYER_EXECUTABLE = "/Library/Input Methods/Squirrel.app/Contents/MacOS/rime_deployer";
const SQUIRREL_SHARED_DATA_DIRECTORY = "/Library/Input Methods/Squirrel.app/Contents/SharedSupport";
const SQUIRREL_SHARED_BUILD_DIRECTORY = join(SQUIRREL_SHARED_DATA_DIRECTORY, "build");
const REQUIRED_SHARED_BUILD_ARTIFACTS = [
  "luna_pinyin.table.bin",
  "luna_pinyin.reverse.bin",
  "stroke.table.bin",
  "stroke.reverse.bin",
  "terra_pinyin.table.bin",
  "terra_pinyin.reverse.bin"
];
const SQUIRREL_PATCH_KEYS = {
  colorScheme: "style/color_scheme",
  candidateLayout: "style/candidate_list_layout",
  textOrientation: "style/text_orientation",
  inlinePreedit: "style/inline_preedit",
  fontPoint: "style/font_point",
  cornerRadius: "style/corner_radius"
};
const DEFAULT_PATCH_KEYS = {
  pageSize: "menu/page_size"
};
const LUNA_PINYIN_PATCH_KEYS = {
  simplificationReset: "switches/@2/reset"
};
const CUSTOM_SKIN_ID = "sancho_custom";
const SKIN_PATCH_FIELDS = {
  name: "name",
  backColor: "back_color",
  borderColor: "border_color",
  textColor: "text_color",
  candidateTextColor: "candidate_text_color",
  commentTextColor: "comment_text_color",
  labelColor: "label_color",
  highlightedBackColor: "hilited_candidate_back_color",
  highlightedTextColor: "hilited_candidate_text_color",
  highlightedLabelColor: "hilited_candidate_label_color",
  highlightedCommentColor: "hilited_comment_text_color"
};

export async function readRimeSettings(options = {}) {
  const rimeDirectory = options.rimeDirectory ?? macRimeDirectory();
  const squirrelPatch = await readPatchMap(join(rimeDirectory, "squirrel.custom.yaml"));
  const defaultPatch = await readPatchMap(join(rimeDirectory, "default.custom.yaml"));
  const lunaPatch = await readPatchMap(join(rimeDirectory, "luna_pinyin.custom.yaml"));
  const simplificationReset = lunaPatch.get(LUNA_PINYIN_PATCH_KEYS.simplificationReset);
  const predictor = await readRimePredictorSettings({ rimeDirectory });

  return normalizeRimeSettings({
    outputScript: Number(simplificationReset) === 0
      ? "traditional"
      : Number(simplificationReset) === 1
      ? "simplified"
      : DEFAULT_RIME_SETTINGS.outputScript,
    candidateLayout: squirrelPatch.get(SQUIRREL_PATCH_KEYS.candidateLayout)
      ?? DEFAULT_RIME_SETTINGS.candidateLayout,
    textOrientation: squirrelPatch.get(SQUIRREL_PATCH_KEYS.textOrientation)
      ?? DEFAULT_RIME_SETTINGS.textOrientation,
    colorScheme: squirrelPatch.get(SQUIRREL_PATCH_KEYS.colorScheme)
      ?? DEFAULT_RIME_SETTINGS.colorScheme,
    pageSize: defaultPatch.get(DEFAULT_PATCH_KEYS.pageSize)
      ?? DEFAULT_RIME_SETTINGS.pageSize,
    fontPoint: squirrelPatch.get(SQUIRREL_PATCH_KEYS.fontPoint)
      ?? DEFAULT_RIME_SETTINGS.fontPoint,
    cornerRadius: squirrelPatch.get(SQUIRREL_PATCH_KEYS.cornerRadius)
      ?? DEFAULT_RIME_SETTINGS.cornerRadius,
    inlinePreedit: squirrelPatch.get(SQUIRREL_PATCH_KEYS.inlinePreedit)
      ?? DEFAULT_RIME_SETTINGS.inlinePreedit,
    englishPunctuation: lunaPatch.get("punctuator/half_shape")
      ?? DEFAULT_RIME_SETTINGS.englishPunctuation,
    customSkin: readSkinFromPatch(squirrelPatch, CUSTOM_SKIN_ID),
    predictor
  });
}

export async function writeRimeSettings(input, options = {}) {
  const rimeDirectory = options.rimeDirectory ?? macRimeDirectory();
  const settings = normalizeRimeSettings(input);
  const paths = {
    squirrel: join(rimeDirectory, "squirrel.custom.yaml"),
    default: join(rimeDirectory, "default.custom.yaml"),
    lunaPinyin: join(rimeDirectory, "luna_pinyin.custom.yaml")
  };

  await updatePatchFile(paths.squirrel, {
    ...sanchoSkinPatch(settings.customSkin),
    [SQUIRREL_PATCH_KEYS.colorScheme]: settings.colorScheme,
    [SQUIRREL_PATCH_KEYS.candidateLayout]: settings.candidateLayout,
    [SQUIRREL_PATCH_KEYS.textOrientation]: settings.textOrientation,
    [SQUIRREL_PATCH_KEYS.inlinePreedit]: settings.inlinePreedit,
    [SQUIRREL_PATCH_KEYS.fontPoint]: settings.fontPoint,
    [SQUIRREL_PATCH_KEYS.cornerRadius]: settings.cornerRadius
  });
  await updatePatchFile(paths.default, {
    [DEFAULT_PATCH_KEYS.pageSize]: settings.pageSize
  });
  await updatePatchFile(paths.lunaPinyin, {
    [LUNA_PINYIN_PATCH_KEYS.simplificationReset]: settings.outputScript === "simplified" ? 1 : 0,
    "punctuator/half_shape": settings.englishPunctuation
  });
  const predictorResult = await writeRimePredictorIntegration(settings.predictor, {
    rimeDirectory
  });

  return {
    settings,
    paths: {
      ...paths,
      predictorSettings: predictorResult.paths.settings,
      predictorLua: predictorResult.paths.lua
    }
  };
}

export function normalizeRimeSettings(input) {
  const raw = {
    ...DEFAULT_RIME_SETTINGS,
    ...(input ?? {})
  };
  return {
    outputScript: enumValue(raw.outputScript, RIME_SETTING_OPTIONS.outputScripts, "outputScript"),
    candidateLayout: enumValue(raw.candidateLayout, RIME_SETTING_OPTIONS.candidateLayouts, "candidateLayout"),
    textOrientation: enumValue(raw.textOrientation, RIME_SETTING_OPTIONS.textOrientations, "textOrientation"),
    colorScheme: enumValue(raw.colorScheme, RIME_SETTING_OPTIONS.colorSchemes, "colorScheme"),
    pageSize: integerRange(raw.pageSize, RIME_SETTING_OPTIONS.pageSize, "pageSize"),
    fontPoint: integerRange(raw.fontPoint, RIME_SETTING_OPTIONS.fontPoint, "fontPoint"),
    cornerRadius: integerRange(raw.cornerRadius, RIME_SETTING_OPTIONS.cornerRadius, "cornerRadius"),
    inlinePreedit: booleanValue(raw.inlinePreedit, "inlinePreedit"),
    englishPunctuation: booleanValue(raw.englishPunctuation, "englishPunctuation"),
    customSkin: normalizeSkin(raw.customSkin ?? DEFAULT_CUSTOM_SKIN),
    predictor: normalizePredictorSettingBlock(raw.predictor ?? DEFAULT_RIME_SETTINGS.predictor)
  };
}

export async function redeploySquirrel(options = {}) {
  const executable = options.executable ?? SQUIRREL_EXECUTABLE;
  const deployerExecutable = options.deployerExecutable ?? RIME_DEPLOYER_EXECUTABLE;
  const rimeDirectory = options.rimeDirectory ?? macRimeDirectory();
  const sharedDataDirectory = options.sharedDataDirectory ?? SQUIRREL_SHARED_DATA_DIRECTORY;
  const buildDirectory = join(rimeDirectory, "build");

  await ensureSharedBuildArtifacts({ ...options, rimeDirectory });
  await execFilePromise(deployerExecutable, [
    "--build",
    rimeDirectory,
    sharedDataDirectory,
    buildDirectory
  ]);
  await ensureSharedBuildArtifacts({ ...options, rimeDirectory });
  await execFilePromise(executable, ["--reload"]);

  return {
    rimeDirectory,
    buildDirectory
  };
}

async function execFilePromise(executable, args) {
  return await new Promise((resolve, reject) => {
    execFile(executable, args, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export async function ensureSharedBuildArtifacts(options = {}) {
  const rimeDirectory = options.rimeDirectory ?? macRimeDirectory();
  const sharedBuildDirectory = options.sharedBuildDirectory ?? SQUIRREL_SHARED_BUILD_DIRECTORY;
  const buildDirectory = join(rimeDirectory, "build");
  const artifacts = options.artifacts ?? REQUIRED_SHARED_BUILD_ARTIFACTS;
  const copied = [];

  await mkdir(buildDirectory, { recursive: true });
  for (const artifact of artifacts) {
    const source = join(sharedBuildDirectory, artifact);
    const destination = join(buildDirectory, artifact);
    const sourceStat = await statIfExists(source);
    if (!sourceStat?.isFile()) {
      continue;
    }

    const destinationStat = await statIfExists(destination);
    if (destinationStat?.isFile() && destinationStat.size >= sourceStat.size) {
      continue;
    }

    await copyFile(source, destination);
    copied.push(destination);
  }

  return {
    copied,
    buildDirectory
  };
}

async function readPatchMap(path) {
  const content = await readUtf8IfExists(path);
  const patchLines = extractPatchLines(content);
  const values = new Map();
  for (const line of patchLines) {
    const match = line.match(/^\s{2}([^:#]+):\s*(.*?)\s*(?:#.*)?$/);
    if (match) {
      values.set(match[1].trim(), parseScalar(match[2].trim()));
    }
  }
  return values;
}

async function statIfExists(path) {
  try {
    return await stat(path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function updatePatchFile(path, patch) {
  const existingText = await readUtf8IfExists(path);
  const nextText = updatePatchText(existingText, patch);
  if (nextText !== existingText) {
    await atomicWriteText(path, nextText);
  }
}

function updatePatchText(existingText, patch) {
  const lineEnding = existingText.includes("\r\n") ? "\r\n" : "\n";
  const patchLines = Object.entries(patch).map(([key, value]) =>
    `  ${key}: ${renderScalar(value)}`
  );
  const body = existingText.trimEnd();

  if (!body) {
    return [
      "# SanchoAiIME managed Rime settings",
      "patch:",
      ...patchLines,
      ""
    ].join(lineEnding);
  }

  const lines = existingText.split(/\r?\n/);
  const patchStart = lines.findIndex((line) => /^patch:\s*$/.test(line));
  if (patchStart === -1) {
    return [
      body,
      "",
      "patch:",
      ...patchLines,
      ""
    ].join(lineEnding);
  }

  const patchEnd = findPatchEnd(lines, patchStart);
  const managedKeys = new Set(Object.keys(patch));
  const beforePatchBody = lines
    .slice(patchStart + 1, patchEnd)
    .filter((line) => !isManagedPatchLine(line, managedKeys));
  const nextLines = [
    ...lines.slice(0, patchStart + 1),
    ...patchLines,
    ...beforePatchBody,
    ...lines.slice(patchEnd)
  ];

  return `${nextLines.join(lineEnding).trimEnd()}${lineEnding}`;
}

function extractPatchLines(content) {
  const lines = content.split(/\r?\n/);
  const patchStart = lines.findIndex((line) => /^patch:\s*$/.test(line));
  if (patchStart === -1) {
    return [];
  }
  return lines.slice(patchStart + 1, findPatchEnd(lines, patchStart));
}

function findPatchEnd(lines, patchStart) {
  for (let index = patchStart + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/.test(line) && !line.startsWith("#")) {
      return index;
    }
  }
  return lines.length;
}

function isManagedPatchLine(line, managedKeys) {
  const match = line.match(/^\s{2}([^:#]+):/);
  return match ? managedKeys.has(match[1].trim()) : false;
}

async function readUtf8IfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
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

function renderScalar(value) {
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string" && /^0x[0-9A-F]{6}$/i.test(value)) {
    return `0x${value.slice(2).toUpperCase()}`;
  }
  return JSON.stringify(String(value));
}

function parseScalar(value) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }
  const quoted = value.match(/^["'](.*)["']$/);
  return quoted ? quoted[1] : value;
}

function enumValue(value, allowed, name) {
  if (allowed.includes(value)) {
    return value;
  }
  throw new Error(`Invalid Rime setting ${name}: ${value}`);
}

function integerRange(value, range, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < range.min || number > range.max) {
    throw new Error(`Invalid Rime setting ${name}: ${value}`);
  }
  return number;
}

function booleanValue(value, name) {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid Rime setting ${name}: ${value}`);
  }
  return value;
}

function normalizePredictorSettingBlock(input) {
  const raw = {
    ...DEFAULT_RIME_SETTINGS.predictor,
    ...(input ?? {})
  };
  return {
    enabled: booleanValue(raw.enabled, "predictor.enabled"),
    port: integerRange(raw.port, { min: 1, max: 65535 }, "predictor.port"),
    timeoutMs: integerRange(raw.timeoutMs ?? raw.timeout_ms, { min: 20, max: 1000 }, "predictor.timeoutMs"),
    candidateLimit: integerRange(
      raw.candidateLimit ?? raw.candidate_limit,
      { min: 3, max: 30 },
      "predictor.candidateLimit"
    ),
    minCodeLength: integerRange(
      raw.minCodeLength ?? raw.min_code_length,
      { min: 1, max: 12 },
      "predictor.minCodeLength"
    ),
    mixedInput: booleanValue(raw.mixedInput, "predictor.mixedInput"),
    runner: normalizeRunnerSettingBlock(raw.runner)
  };
}

function normalizeRunnerSettingBlock(input) {
  const raw = {
    provider: "none",
    ...(input ?? {})
  };
  const provider = String(raw.provider ?? "none").trim().toLowerCase();
  return {
    provider: ["none", "http", "ollama", "deepseek-flash"].includes(provider) ? provider : "none",
    endpoint: optionalString(raw.endpoint),
    ollamaModel: optionalString(raw.ollamaModel ?? raw.ollama_model),
    ollamaEndpoint: optionalString(raw.ollamaEndpoint ?? raw.ollama_endpoint),
    timeoutMs: raw.timeoutMs === undefined && raw.timeout_ms === undefined
      ? undefined
      : integerRange(raw.timeoutMs ?? raw.timeout_ms, { min: 1000, max: 30000 }, "predictor.runner.timeoutMs")
  };
}

function optionalString(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function sanchoSkinPatch(customSkin) {
  const patch = {};
  for (const [id, skin] of Object.entries(SANCHO_SKIN_PRESETS)) {
    Object.assign(patch, skinPatch(id, skin));
  }
  Object.assign(patch, skinPatch(CUSTOM_SKIN_ID, customSkin));
  return patch;
}

function skinPatch(id, skin) {
  const patch = {};
  for (const [settingKey, patchKey] of Object.entries(SKIN_PATCH_FIELDS)) {
    patch[`preset_color_schemes/${id}/${patchKey}`] = settingKey === "name"
      ? skin.name
      : cssHexToRimeColor(skin[settingKey]);
  }
  return patch;
}

function readSkinFromPatch(patch, id) {
  const skin = {};
  for (const [settingKey, patchKey] of Object.entries(SKIN_PATCH_FIELDS)) {
    const value = patch.get(`preset_color_schemes/${id}/${patchKey}`);
    if (value === undefined) {
      continue;
    }
    skin[settingKey] = settingKey === "name" ? String(value) : rimeColorToCssHex(value);
  }
  return normalizeSkin({
    ...DEFAULT_CUSTOM_SKIN,
    ...skin
  });
}

function normalizeSkin(input) {
  const raw = {
    ...DEFAULT_CUSTOM_SKIN,
    ...(input ?? {})
  };
  return {
    name: normalizeSkinName(raw.name),
    backColor: normalizeCssColor(raw.backColor, "backColor"),
    borderColor: normalizeCssColor(raw.borderColor, "borderColor"),
    textColor: normalizeCssColor(raw.textColor, "textColor"),
    candidateTextColor: normalizeCssColor(raw.candidateTextColor, "candidateTextColor"),
    commentTextColor: normalizeCssColor(raw.commentTextColor, "commentTextColor"),
    labelColor: normalizeCssColor(raw.labelColor, "labelColor"),
    highlightedBackColor: normalizeCssColor(raw.highlightedBackColor, "highlightedBackColor"),
    highlightedTextColor: normalizeCssColor(raw.highlightedTextColor, "highlightedTextColor"),
    highlightedLabelColor: normalizeCssColor(raw.highlightedLabelColor, "highlightedLabelColor"),
    highlightedCommentColor: normalizeCssColor(raw.highlightedCommentColor, "highlightedCommentColor")
  };
}

function normalizeSkinName(value) {
  const name = String(value ?? "").trim();
  if (!name || /[\r\n\t]/.test(name)) {
    throw new Error(`Invalid Rime skin name: ${value}`);
  }
  return name.slice(0, 40);
}

function normalizeCssColor(value, name) {
  const color = String(value ?? "").trim();
  const match = color.match(/^#?([0-9a-f]{6})$/i);
  if (!match) {
    throw new Error(`Invalid Rime skin color ${name}: ${value}`);
  }
  return `#${match[1].toUpperCase()}`;
}

function cssHexToRimeColor(value) {
  const [, red, green, blue] = normalizeCssColor(value, "color")
    .match(/^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/);
  return `0x${blue}${green}${red}`;
}

function rimeColorToCssHex(value) {
  const text = String(value ?? "").trim();
  const rimeMatch = text.match(/^0x([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (rimeMatch) {
    const [, blue, green, red] = rimeMatch.map((part) => part.toUpperCase());
    return `#${red}${green}${blue}`;
  }
  const cssMatch = text.match(/^#?([0-9a-f]{6})$/i);
  return cssMatch ? `#${cssMatch[1].toUpperCase()}` : DEFAULT_CUSTOM_SKIN.backColor;
}
