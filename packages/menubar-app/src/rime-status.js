import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import {
  actionsToQuickDictionaryEntries,
  BEGIN_MARKER,
  END_MARKER
} from "@sancho-ai-ime/quick-dictionary";

import { macCustomPhrasePath, macRimeDirectory } from "./platform.js";

const DEFAULT_SQUIRREL_SHARED_SUPPORT_DIRECTORY = "/Library/Input Methods/Squirrel.app/Contents/SharedSupport";

export async function getRimeIntegrationStatus(options = {}) {
  const rimeDirectory = options.rimeDirectory ?? macRimeDirectory();
  const sharedSupportDirectory = options.sharedSupportDirectory
    ?? DEFAULT_SQUIRREL_SHARED_SUPPORT_DIRECTORY;
  const customPhrasePath = options.customPhrasePath ?? macCustomPhrasePath();
  const actionRegistry = options.actionRegistry ?? { actions: [], profiles: [] };
  const expectedEntries = actionsToQuickDictionaryEntries(actionRegistry);
  const defaultConfig = await readPreferredDefaultConfig(rimeDirectory, sharedSupportDirectory);
  const schemaIds = defaultConfig ? extractSchemaList(defaultConfig.content) : [];
  const activeSchemaId = schemaIds[0];
  const schemaConfig = activeSchemaId
    ? await readPreferredSchemaConfig(rimeDirectory, sharedSupportDirectory, activeSchemaId)
    : undefined;
  const customPhrase = await inspectCustomPhrase(customPhrasePath, expectedEntries);
  const installation = await inspectInstallation(rimeDirectory);
  const hasCustomPhraseTranslator = Boolean(schemaConfig?.content.includes("table_translator@custom_phrase"));
  const hasCustomPhraseUserDict = Boolean(schemaConfig?.content.match(/custom_phrase:\s*[\s\S]*?user_dict:\s*"?custom_phrase"?/));
  const schemaModifiedAt = schemaConfig?.path ? await fileModifiedAt(schemaConfig.path) : undefined;
  const customPhraseModifiedAt = await fileModifiedAt(customPhrasePath);
  const deploymentModifiedAt = await latestModifiedAt(join(rimeDirectory, "build"));
  const deployedConfigModifiedAt = deploymentModifiedAt ?? schemaModifiedAt;
  const maybeNeedsRedeploy = Boolean(
    customPhraseModifiedAt
    && deployedConfigModifiedAt
    && customPhraseModifiedAt.getTime() > deployedConfigModifiedAt.getTime()
  );

  return {
    mode: "rime-compatible",
    status: statusFor({
      activeSchemaId,
      customPhrase,
      hasCustomPhraseTranslator,
      hasCustomPhraseUserDict
    }),
    rimeDirectory,
    installation,
    schema: {
      id: activeSchemaId,
      name: schemaConfig ? extractSchemaName(schemaConfig.content) : undefined,
      path: schemaConfig?.path,
      available: schemaIds
    },
    customPhrase,
    integration: {
      hasCustomPhraseTranslator,
      hasCustomPhraseUserDict,
      testEntries: expectedEntries.map((entry) => ({
        surface: entry.surface,
        code: entry.code
      }))
    },
    deployment: {
      defaultConfigPath: defaultConfig?.path,
      schemaModifiedAt: schemaModifiedAt?.toISOString(),
      deploymentModifiedAt: deploymentModifiedAt?.toISOString(),
      customPhraseModifiedAt: customPhraseModifiedAt?.toISOString(),
      maybeNeedsRedeploy
    }
  };
}

export function formatRimeIntegrationStatus(status, translator) {
  const t = translator.t;
  const schemaText = status.schema.id
    ? `${status.schema.name ?? status.schema.id} (${status.schema.id})`
    : t("rimeStatusNoSchema");
  const modeText = t("rimeStatusCompatibleMode");
  const managedText = status.customPhrase.managedRegionStatus === "ready"
    ? t("rimeStatusManagedReady", { count: status.customPhrase.managedEntryCount })
    : t("rimeStatusManagedMissing", { status: status.customPhrase.managedRegionStatus });
  const customPhraseText = status.integration.hasCustomPhraseTranslator
    ? t("rimeStatusCustomPhraseEnabled")
    : t("rimeStatusCustomPhraseDisabled");
  const testEntry = status.integration.testEntries[0];
  const testText = testEntry
    ? t("rimeStatusTestCode", {
      code: testEntry.code,
      surface: testEntry.surface
    })
    : t("rimeStatusNoTestCode");
  const redeployText = status.deployment.maybeNeedsRedeploy
    ? t("rimeStatusRedeployRecommended")
    : t("rimeStatusRedeployOk");

  return [
    t("rimeStatusMode", { mode: modeText }),
    t("rimeStatusSchema", { schema: schemaText }),
    managedText,
    customPhraseText,
    redeployText,
    testText,
    "",
    t("rimeStatusDirectory", { path: status.rimeDirectory })
  ].join("\n");
}

async function readPreferredDefaultConfig(rimeDirectory, sharedSupportDirectory) {
  return await readFirstExisting([
    join(rimeDirectory, "build", "default.yaml"),
    join(rimeDirectory, "default.yaml"),
    join(sharedSupportDirectory, "build", "default.yaml"),
    join(sharedSupportDirectory, "default.yaml")
  ]);
}

async function readPreferredSchemaConfig(rimeDirectory, sharedSupportDirectory, schemaId) {
  return await readFirstExisting([
    join(rimeDirectory, "build", `${schemaId}.schema.yaml`),
    join(rimeDirectory, `${schemaId}.schema.yaml`),
    join(sharedSupportDirectory, "build", `${schemaId}.schema.yaml`),
    join(sharedSupportDirectory, `${schemaId}.schema.yaml`)
  ]);
}

async function readFirstExisting(paths) {
  for (const path of paths) {
    try {
      return {
        path,
        content: await readFile(path, "utf8")
      };
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
  return undefined;
}

async function inspectCustomPhrase(path, expectedEntries) {
  let content = "";
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const hasBegin = content.includes(BEGIN_MARKER);
  const hasEnd = content.includes(END_MARKER);
  const managedRegionStatus = hasBegin && hasEnd
    ? "ready"
    : hasBegin || hasEnd
      ? "malformed"
      : content
        ? "not-synced"
        : "not-created";
  const managedEntries = extractManagedEntries(content);
  const managedCodes = new Set(managedEntries.map((entry) => entry.code));
  const missingExpectedCodes = expectedEntries
    .map((entry) => entry.code)
    .filter((code) => !managedCodes.has(code));

  return {
    path,
    managedRegionStatus,
    managedEntryCount: managedEntries.length,
    managedEntries,
    missingExpectedCodes
  };
}

function extractSchemaList(content) {
  const schemaIds = [];
  const lines = content.split(/\r?\n/);
  let inSchemaList = false;
  for (const line of lines) {
    if (/^schema_list:\s*$/.test(line)) {
      inSchemaList = true;
      continue;
    }
    if (inSchemaList && /^\S/.test(line)) {
      break;
    }
    if (!inSchemaList) {
      continue;
    }
    const match = line.match(/^\s*-\s*schema:\s*"?([^"#]+?)"?\s*(?:#.*)?$/);
    if (match) {
      schemaIds.push(match[1].trim());
    }
  }
  return schemaIds;
}

function extractSchemaName(content) {
  const match = content.match(/^\s*name:\s*"?([^"\n#]+?)"?\s*(?:#.*)?$/m);
  return match?.[1]?.trim();
}

function extractManagedEntries(content) {
  const beginIndex = content.indexOf(BEGIN_MARKER);
  const endIndex = content.indexOf(END_MARKER);
  if (beginIndex === -1 || endIndex === -1 || endIndex <= beginIndex) {
    return [];
  }

  return content
    .slice(beginIndex + BEGIN_MARKER.length, endIndex)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [surface, code, weight] = line.split("\t");
      return {
        surface,
        code,
        weight: Number(weight)
      };
    })
    .filter((entry) => entry.surface && entry.code);
}

async function inspectInstallation(rimeDirectory) {
  const installation = await readFirstExisting([join(rimeDirectory, "installation.yaml")]);
  if (!installation) {
    return {};
  }
  return {
    distributionName: extractYamlValue(installation.content, "distribution_name"),
    distributionVersion: extractYamlValue(installation.content, "distribution_version"),
    rimeVersion: extractYamlValue(installation.content, "rime_version")
  };
}

function extractYamlValue(content, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^${escapedKey}:\\s*\"?([^\"\\n#]+?)\"?\\s*(?:#.*)?$`, "m"));
  return match?.[1]?.trim();
}

async function fileModifiedAt(path) {
  try {
    return (await stat(path)).mtime;
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function latestModifiedAt(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  const modifiedTimes = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => fileModifiedAt(join(directory, entry.name)))
  );
  return modifiedTimes
    .filter(Boolean)
    .sort((left, right) => right.getTime() - left.getTime())[0];
}

function statusFor(parts) {
  if (
    parts.activeSchemaId
    && parts.customPhrase.managedRegionStatus === "ready"
    && parts.customPhrase.missingExpectedCodes.length === 0
    && parts.hasCustomPhraseTranslator
    && parts.hasCustomPhraseUserDict
  ) {
    return "ready";
  }
  return "attention";
}
