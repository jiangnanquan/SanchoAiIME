import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  createDashboardViewModel,
  renderDashboardHtml
} from "@sancho-ai-ime/dashboard";
import {
  actionsToQuickDictionaryEntries,
  BEGIN_MARKER,
  END_MARKER,
  parseCustomPhraseText
} from "@sancho-ai-ime/quick-dictionary";

import { macCustomPhrasePath } from "./platform.js";
import { createMenubarTranslator } from "./i18n.js";
import { getLocalPredictorState } from "./model-runtime.js";
import { getStandalonePredictorStatus } from "./predictor-service.js";
import { inspectRimePredictorIntegration } from "./rime-predictor-integration.js";
import { readRimeSettings } from "./rime-settings.js";
import { getRimeIntegrationStatus } from "./rime-status.js";

export function createDefaultActionRegistry(translator = createMenubarTranslator()) {
  const t = translator.t;
  return {
  profiles: [
    {
      id: "sancho-dashboard",
      label: t("menuProfileLabel"),
      command: "sancho-dashboard",
      args: [],
      inheritEnv: true,
      env: {}
    }
  ],
  actions: [
    {
      id: "snippet.qwen",
      code: "qwp",
      label: t("actionQwen"),
      kind: "insert_text",
      text: t("actionQwen"),
      insertPreview: t("actionQwen"),
      weight: 90
    },
    {
      id: "snippet.deepseek",
      code: "dsf",
      label: t("actionDeepSeek"),
      kind: "insert_text",
      text: t("actionDeepSeek"),
      insertPreview: t("actionDeepSeek"),
      weight: 99
    },
    {
      id: "profile.dashboard",
      code: "sdb",
      label: t("actionDashboard"),
      kind: "profile_switch",
      profile: "sancho-dashboard",
      insertPreview: t("actionDashboard"),
      weight: 80
    }
  ]
  };
}

export async function buildDashboardInput(options = {}) {
  const translator = options.translator ?? createMenubarTranslator();
  const t = translator.t;
  const customPhrasePath = options.customPhrasePath ?? macCustomPhrasePath();
  const actionRegistry = options.actionRegistry ?? createDefaultActionRegistry(translator);
  const entries = actionsToQuickDictionaryEntries(actionRegistry);
  const customPhraseView = await readCustomPhraseView(customPhrasePath);
  const managedRegionStatus = await detectManagedRegionStatus(customPhrasePath);
  const modelState = options.modelState ?? await readModelState(options);
  const modelStatus = dashboardModelStatus(modelState);
  const inputMethodSettings = options.inputMethodSettings ?? await readInputMethodSettings(options);
  inputMethodSettings.predictor = await readPredictorDashboardStatus({
    ...options,
    customPhrasePath,
    modelState,
    inputMethodSettings
  });
  const rimeStatus = options.rimeStatus ?? await readRimeStatus({
    ...options,
    customPhrasePath,
    actionRegistry
  });

  return {
    title: t("dashboardTitle"),
    generatedAt: new Date().toISOString(),
    quickDictionary: {
      path: customPhrasePath,
      managedRegionStatus,
      entries,
      customEntries: customPhraseView.userEntries,
      customSummary: customPhraseView.summary,
      invalidRows: customPhraseView.invalidRows
    },
    inputMethodSettings,
    actionRegistry,
    models: [
      {
        id: modelState.manifest.id,
        name: modelState.manifest.name,
        role: modelState.manifest.role,
        status: modelStatus,
        source: modelState.manifest.source,
        artifacts: modelState.manifest.artifacts,
        benchmark: modelState.manifest.benchmark
      }
    ],
    imports: [],
    maintenanceJobs: [],
    releaseChecks: [
      {
        id: "menubar",
        label: t("releaseMenuBar"),
        status: "pass",
        detail: t("releaseMenuBarDetail")
      },
      {
        id: "rime-path",
        label: t("releaseRimePath"),
        status: managedRegionStatus === "ready" ? "pass" : "warn",
        detail: managedRegionStatus
      },
      {
        id: "rime-integration",
        label: t("releaseRimeIntegration"),
        status: rimeStatus.status === "ready" ? "pass" : "warn",
        detail: rimeStatus.schema.id
          ? `${rimeStatus.schema.name ?? rimeStatus.schema.id} (${rimeStatus.schema.id})`
          : t("rimeStatusNoSchema")
      },
      {
        id: "local-model",
        label: t("releaseLocalModel"),
        status: modelStatus === "ready" ? "pass" : "warn",
        detail: modelStatus === "ready"
          ? t("localModelLoadedDetail", { path: modelState.modelDir })
          : t("localModelMissingDetail")
      }
    ]
  };
}

async function readRimeStatus(options) {
  try {
    return await getRimeIntegrationStatus({
      rimeDirectory: options.rimeDirectory,
      customPhrasePath: options.customPhrasePath,
      actionRegistry: options.actionRegistry
    });
  } catch (error) {
    return {
      error,
      status: "attention",
      schema: {},
      customPhrase: {
        managedRegionStatus: "unknown",
        managedEntryCount: 0
      },
      integration: {
        hasCustomPhraseTranslator: false,
        hasCustomPhraseUserDict: false,
        testEntries: []
      },
      deployment: {}
    };
  }
}

async function readCustomPhraseView(customPhrasePath) {
  try {
    const content = await readFile(customPhrasePath, "utf8");
    return parseCustomPhraseText(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        userEntries: [],
        summary: {
          entryCount: 0,
          userEntryCount: 0,
          managedEntryCount: 0,
          blankRowCount: 0,
          commentRowCount: 0,
          invalidRowCount: 0
        },
        invalidRows: []
      };
    }
    throw error;
  }
}

async function readInputMethodSettings(options) {
  try {
    const settings = await readRimeSettings({
      rimeDirectory: options.rimeDirectory
    });
    return {
      status: "ready",
      ...settings,
      customSkinName: settings.customSkin?.name,
      aiSkinAssistant: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        status: "available"
      }
    };
  } catch (error) {
    return {
      status: "attention",
      outputScript: "unknown",
      colorScheme: "unknown",
      candidateLayout: "unknown",
      textOrientation: "unknown",
      pageSize: undefined,
      fontPoint: undefined,
      cornerRadius: undefined,
      inlinePreedit: undefined,
      customSkinName: undefined,
      aiSkinAssistant: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        status: "unknown"
      },
      error: error.message
    };
  }
}

async function readPredictorDashboardStatus(options = {}) {
  try {
    const settings = options.inputMethodSettings?.predictor;
    const runtimeStatus = options.predictorStatus ?? await getStandalonePredictorStatus({
      settings,
      customPhrasePath: options.customPhrasePath,
      modelStateReader: async () => options.modelState ?? await readModelState(options),
      service: options.predictorServiceStatus?.service,
      running: options.predictorServiceStatus?.running
    });
    const integration = await inspectRimePredictorIntegration({
      rimeDirectory: options.rimeDirectory
    });
    const ready = runtimeStatus.enabled
      && runtimeStatus.running
      && integration.luaInstalled
      && integration.filterPatched;
    return {
      ...runtimeStatus,
      status: ready ? "ready" : runtimeStatus.enabled ? "attention" : "disabled",
      luaInstalled: integration.luaInstalled,
      filterPatched: integration.filterPatched,
      luaPath: integration.luaPath,
      schemaPath: integration.schemaPath
    };
  } catch (error) {
    return {
      status: "attention",
      enabled: false,
      running: false,
      service: "error",
      mode: "unknown",
      error: error.message
    };
  }
}

export async function writeDashboardFiles(options = {}) {
  const outputDirectory = options.outputDirectory;
  if (!outputDirectory) {
    throw new Error("Dashboard outputDirectory is required.");
  }

  const translator = options.translator ?? createMenubarTranslator();
  const input = await buildDashboardInput({ ...options, translator });
  const model = createDashboardViewModel(input, { locale: translator.locale });
  const html = renderDashboardHtml(model, {
    lang: translator.locale,
    locale: translator.locale
  });
  const statePath = join(outputDirectory, "dashboard-state.json");
  const htmlPath = join(outputDirectory, "dashboard.html");

  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(input, null, 2)}\n`, "utf8");
  await writeFile(htmlPath, html, "utf8");

  return {
    htmlPath,
    statePath,
    input,
    model
  };
}

async function readModelState(options) {
  try {
    return await getLocalPredictorState({
      modelsDir: options.modelsDir
    });
  } catch (error) {
    return {
      error,
      modelDir: "",
      manifest: {
        id: "qwen2.5-0.5b-instruct-q4_k_m",
        name: "Qwen2.5-0.5B-Instruct GGUF Q4_K_M",
        role: "local-realtime-predictor",
        source: {
          type: "huggingface",
          repository: "lmstudio-community/Qwen2.5-0.5B-Instruct-GGUF",
          license: "Apache-2.0"
        },
        artifacts: [],
        benchmark: {
          iterations: 3,
          timeoutMs: 30000
        }
      },
      status: "missing"
    };
  }
}

function dashboardModelStatus(modelState) {
  if (modelState.status === "loaded") {
    return "ready";
  }
  if (modelState.status === "downloaded") {
    return "downloaded";
  }
  return "not-configured";
}

async function detectManagedRegionStatus(customPhrasePath) {
  let content;
  try {
    content = await readFile(customPhrasePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return "not-created";
    }
    throw error;
  }

  const hasBegin = content.includes(BEGIN_MARKER);
  const hasEnd = content.includes(END_MARKER);
  if (hasBegin && hasEnd) {
    return "ready";
  }
  if (hasBegin || hasEnd) {
    return "malformed";
  }
  return "not-synced";
}
