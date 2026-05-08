import { createTranslator } from "./i18n.js";

export const DEFAULT_DASHBOARD_TITLE = "SanchoAiIME 控制台";

const DEFAULT_MODEL_CARD = {
  id: "ministral-3-3b",
  name: "Mistral 3 3.8B",
  role: "local-realtime-predictor",
  status: "not-configured",
  source: {
    type: "ollama",
    repository: "ministral-3:3b",
    license: "Apache-2.0"
  },
  artifactCount: 0,
  benchmark: {
    iterations: 3,
    timeoutMs: 30000
  }
};

const ACTION_KINDS = new Set([
  "insert_text",
  "copy_text",
  "run_command",
  "profile_switch",
  "open_url",
  "skill_invoke"
]);

const INSERTION_ACTION_KINDS = new Set(["insert_text", "copy_text"]);
const SENSITIVE_ENV_NAME = /(?:api[_-]?key|token|secret|password|credential|auth|bearer)/i;
const SENSITIVE_VALUE = /(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})/;
const REDACTED_VALUE = "[redacted]";
const DEFAULT_INPUT_METHOD_SKIN = Object.freeze({
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

export function createDashboardViewModel(input = {}, options = {}) {
  const translator = createTranslator(options.locale);
  const t = translator.t;
  const raw = expectPlainObject(input, "Dashboard input");
  const title = cleanOptionalString(raw.title, "Dashboard title") ?? t("dashboard.title");
  const quickDictionary = normalizeQuickDictionary(
    raw.quickDictionary ?? raw.quick_dictionary ?? {}
  );
  const registry = normalizeRegistry(
    raw.actionRegistry ?? raw.action_registry ?? {
      actions: raw.actions ?? [],
      profiles: raw.profiles ?? []
    }
  );
  const models = normalizeModels(raw.models ?? raw.modelManifests ?? raw.model_manifests);
  const inputMethodSettings = normalizeInputMethodSettings(
    raw.inputMethodSettings ?? raw.input_method_settings ?? raw.rimeSettings ?? raw.rime_settings
  );
  const imports = normalizeImportPreviews(raw.imports ?? raw.importPreviews ?? raw.import_previews);
  const maintenanceJobs = normalizeMaintenanceJobs(
    raw.maintenanceJobs ?? raw.maintenance_jobs ?? raw.jobs
  );
  const releaseChecks = normalizeReleaseChecks(
    raw.releaseChecks ?? raw.release_checks ?? raw.release
  );

  return {
    schemaVersion: 1,
    generatedAt: cleanOptionalString(raw.generatedAt, "Dashboard generatedAt")
      ?? new Date().toISOString(),
    title,
    summary: buildSummary({
      quickDictionary,
      actions: registry.actions,
      profiles: registry.profiles,
      models,
      imports,
      maintenanceJobs,
      releaseChecks
    }),
    navigation: [
      { id: "quick-dictionary", label: t("nav.quickDictionary") },
      { id: "input-method", label: t("nav.inputMethod") },
      { id: "actions", label: t("nav.actions") },
      { id: "profiles", label: t("nav.profiles") },
      { id: "models", label: t("nav.models") },
      { id: "imports", label: t("nav.imports") },
      { id: "maintenance", label: t("nav.maintenance") },
      { id: "release", label: t("nav.release") }
    ],
    quickDictionary,
    inputMethodSettings,
    actions: registry.actions,
    profiles: registry.profiles,
    models,
    imports,
    maintenanceJobs,
    releaseChecks
  };
}

export function createSampleDashboardInput(options = {}) {
  const { t } = createTranslator(options.locale);
  return {
    title: t("dashboard.title"),
    quickDictionary: {
      path: "/Users/jnq/Library/Rime/custom_phrase.txt",
      managedRegionStatus: "ready",
      customEntries: [
        { surface: "DuckDB", preview: "DuckDB", code: "du", weight: 50, lineNumber: 4 },
        { surface: "静夜思\\n\\s\\s李白", preview: "静夜思\n  李白", code: "jys", weight: 50, lineNumber: 3 }
      ],
      customSummary: {
        entryCount: 4,
        userEntryCount: 2,
        managedEntryCount: 2,
        blankRowCount: 0,
        commentRowCount: 1,
        invalidRowCount: 0
      },
      entries: [
        { surface: "SanchoExo Codex DeepSeek", code: "cds", weight: 99 },
        { surface: "Qwen 本地预测", code: "qwp", weight: 90 }
      ]
    },
    actionRegistry: {
      profiles: [
        {
          id: "sanchoexo-codex-deepseek",
          label: "SanchoExo / Codex / DeepSeek",
          command: "codex",
          args: [],
          cwd: "/Users/jnq/Dev/Private/SanchoExo",
          inheritEnv: true,
          env: {
            OPENAI_BASE_URL: "https://api.deepseek.com",
            OPENAI_MODEL: "deepseek-v4-flash",
            DEEPSEEK_API_KEY: "sample-secret-value-that-will-be-redacted"
          }
        }
      ],
      actions: [
        {
          id: "snippet.qwen",
          code: "qwp",
          label: "Qwen 本地预测",
          kind: "insert_text",
          text: "Qwen 本地预测",
          risk: "normal",
          weight: 90
        },
        {
          id: "profile.sanchoexo.codex.deepseek",
          code: "cds",
          label: "SanchoExo + Codex + DeepSeek",
          kind: "profile_switch",
          profile: "sanchoexo-codex-deepseek",
          insertPreview: "SanchoExo Codex DeepSeek",
          risk: "normal",
          weight: 99
        },
        {
          id: "command.release-check",
          code: "rlc",
          label: "运行发布检查",
          kind: "run_command",
          command: "npm",
          args: ["run", "release:check"],
          risk: "confirm",
          weight: 80
        }
      ]
    },
    inputMethodSettings: {
      status: "ready",
      outputScript: "simplified",
      colorScheme: "sancho_mist",
      candidateLayout: "stacked",
      textOrientation: "horizontal",
      pageSize: 5,
      fontPoint: 18,
      cornerRadius: 8,
      inlinePreedit: true,
      customSkinName: "Sancho Mist",
      customSkin: DEFAULT_INPUT_METHOD_SKIN,
      aiSkinAssistant: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        status: "available"
      },
      predictor: {
        enabled: true,
        status: "ready",
        service: "running",
        running: true,
        endpoint: "http://127.0.0.1:18840",
        mode: "lexicon",
        modelStatus: "ready",
        timeoutMs: 80,
        candidateLimit: 12,
        minCodeLength: 2,
        luaInstalled: true,
        filterPatched: true,
        runner: {
          provider: "none",
          enabled: false,
          configured: false,
          cacheSize: 0,
          pendingCount: 0
        }
      }
    },
    models: [
      {
        id: "ministral-3-3b",
        name: "Mistral 3 3.8B",
        role: "local-realtime-predictor",
        status: "planned",
        source: {
          type: "ollama",
          repository: "ministral-3:3b",
          license: "Apache-2.0"
        },
        artifacts: [],
        benchmark: {
          iterations: 3,
          timeoutMs: 30000
        }
      }
    ],
    imports: [
      {
        source: "rime-custom-phrase",
        format: "rime-custom-phrase",
        summary: {
          parsedRows: 42,
          acceptedRows: 41,
          rejectedRows: 1,
          duplicateRows: 3,
          importedEntries: 38
        },
        entries: [
          { surface: "private phrase omitted", reading: "omit", weight: 1 }
        ]
      }
    ],
    maintenanceJobs: [
      {
        id: "job_20260428_lexicon_audit",
        kind: "health_audit",
        model: "deepseek-v4-flash",
        privacyMode: "redacted",
        budgetCents: 10,
        status: "pending_review",
        scope: ["quick_dictionary", "import_summaries"]
      }
    ],
    releaseChecks: [
      { id: "license", label: "LICENSE", status: "pass" },
      { id: "notice", label: "NOTICE", status: "pass" },
      { id: "model-licenses", label: "MODEL_LICENSES.md", status: "pass" },
      { id: "secret-scan", label: "Tracked secret scan", status: "pass" }
    ]
  };
}

export function isSensitiveEnvEntry(name, value) {
  return SENSITIVE_ENV_NAME.test(String(name)) || SENSITIVE_VALUE.test(String(value));
}

function normalizeQuickDictionary(input) {
  const raw = Array.isArray(input)
    ? { entries: input }
    : expectPlainObject(input, "Quick dictionary input");
  const entries = normalizeArray(raw.entries ?? raw.phrases ?? [], "Quick dictionary entries")
    .map(normalizeQuickDictionaryEntry);
  const customEntries = normalizeArray(
    raw.customEntries ?? raw.custom_entries ?? raw.userEntries ?? raw.user_entries ?? [],
    "Custom phrase entries"
  ).map(normalizeCustomPhraseEntry);
  const invalidRows = normalizeArray(
    raw.invalidRows ?? raw.invalid_rows ?? [],
    "Custom phrase invalid rows"
  ).map(normalizeInvalidCustomPhraseRow);
  const customSummary = normalizeCustomPhraseSummary(
    raw.customSummary ?? raw.custom_summary,
    { customEntries, entries, invalidRows }
  );

  return {
    path: cleanOptionalString(raw.path, "Quick dictionary path")
      ?? "/Users/jnq/Library/Rime/custom_phrase.txt",
    managedRegionStatus: cleanOptionalString(
      raw.managedRegionStatus ?? raw.managed_region_status,
      "Managed region status"
    ) ?? "unknown",
    lastSyncedAt: cleanOptionalString(raw.lastSyncedAt ?? raw.last_synced_at, "Last synced at"),
    summary: {
      entryCount: entries.length,
      customEntryCount: customEntries.length,
      invalidRowCount: invalidRows.length,
      averageWeight: average(entries.map((entry) => entry.weight))
    },
    customSummary,
    customEntries,
    invalidRows,
    entries
  };
}

function normalizeQuickDictionaryEntry(input) {
  const raw = expectPlainObject(input, "Quick dictionary entry");
  return {
    surface: cleanRequiredString(raw.surface ?? raw.text ?? raw.phrase, "Entry surface"),
    code: cleanRequiredString(raw.code ?? raw.reading, "Entry code"),
    weight: normalizeInteger(raw.weight ?? 99, "Entry weight", { min: 0, max: 999999 })
  };
}

function normalizeCustomPhraseEntry(input) {
  const raw = expectPlainObject(input, "Custom phrase entry");
  const entry = normalizeQuickDictionaryEntry(raw);
  const candidatePosition = normalizeOptionalInteger(
    raw.candidatePosition ?? raw.candidate_position ?? raw.position,
    "Custom phrase candidate position"
  );
  return {
    ...entry,
    preview: cleanOptionalString(raw.preview, "Custom phrase preview") ?? entry.surface,
    source: cleanOptionalString(raw.source, "Custom phrase source") ?? "user",
    lineNumber: normalizeOptionalInteger(raw.lineNumber ?? raw.line_number, "Custom phrase line number"),
    candidatePosition
  };
}

function normalizeInvalidCustomPhraseRow(input) {
  const raw = expectPlainObject(input, "Invalid custom phrase row");
  return {
    lineNumber: normalizeOptionalInteger(raw.lineNumber ?? raw.line_number, "Invalid row line number"),
    raw: cleanOptionalString(raw.raw, "Invalid row raw") ?? "",
    reason: cleanOptionalString(raw.reason, "Invalid row reason") ?? "unknown"
  };
}

function normalizeCustomPhraseSummary(input, fallback) {
  const raw = input === undefined || input === null
    ? {}
    : expectPlainObject(input, "Custom phrase summary");
  return {
    entryCount: normalizeOptionalInteger(raw.entryCount ?? raw.entry_count, "Custom phrase entry count")
      ?? (fallback.customEntries.length + fallback.entries.length),
    userEntryCount: normalizeOptionalInteger(
      raw.userEntryCount ?? raw.user_entry_count,
      "Custom phrase user entry count"
    ) ?? fallback.customEntries.length,
    managedEntryCount: normalizeOptionalInteger(
      raw.managedEntryCount ?? raw.managed_entry_count,
      "Custom phrase managed entry count"
    ) ?? fallback.entries.length,
    blankRowCount: normalizeOptionalInteger(
      raw.blankRowCount ?? raw.blank_row_count,
      "Custom phrase blank row count"
    ) ?? 0,
    commentRowCount: normalizeOptionalInteger(
      raw.commentRowCount ?? raw.comment_row_count,
      "Custom phrase comment row count"
    ) ?? 0,
    invalidRowCount: normalizeOptionalInteger(
      raw.invalidRowCount ?? raw.invalid_row_count,
      "Custom phrase invalid row count"
    ) ?? fallback.invalidRows.length
  };
}

function normalizeRegistry(input) {
  const raw = Array.isArray(input)
    ? { actions: input, profiles: [] }
    : expectPlainObject(input, "Action registry input");
  const profiles = normalizeArray(raw.profiles ?? [], "Profiles").map(normalizeProfile);
  const profileLabels = new Map(profiles.map((profile) => [profile.id, profile.label]));
  const actions = normalizeArray(raw.actions ?? raw.registry ?? [], "Actions")
    .map((action) => normalizeAction(action, { profileLabels }));

  return { actions, profiles };
}

function normalizeAction(input, context) {
  const raw = expectPlainObject(input, "Action");
  const kind = cleanOptionalString(raw.kind, "Action kind") ?? "insert_text";
  const risk = cleanOptionalString(raw.risk, "Action risk")
    ?? (kind === "run_command" ? "confirm" : "normal");
  const category = INSERTION_ACTION_KINDS.has(kind) ? "snippet" : "executable";
  const target = actionTarget(raw, kind, context);

  return {
    id: cleanRequiredString(raw.id ?? raw.code, "Action id"),
    code: cleanRequiredString(raw.code ?? raw.reading, "Action code"),
    label: cleanRequiredString(raw.label ?? raw.name ?? raw.id, "Action label"),
    kind: ACTION_KINDS.has(kind) ? kind : "unknown",
    category,
    risk,
    requiresConfirmation: risk !== "normal",
    insertPreview: cleanOptionalString(
      raw.insertPreview ?? raw.insert_preview ?? raw.preview,
      "Action insert preview"
    ),
    target,
    weight: normalizeInteger(raw.weight ?? 90, "Action weight", { min: 0, max: 999999 })
  };
}

function actionTarget(raw, kind, context) {
  if (kind === "profile_switch") {
    const profileId = cleanOptionalString(raw.profile, "Action profile");
    return {
      type: "profile",
      id: profileId,
      label: profileId ? context.profileLabels.get(profileId) ?? profileId : undefined
    };
  }
  if (kind === "run_command") {
    return {
      type: "command",
      command: cleanOptionalString(raw.command, "Action command"),
      args: normalizeActionArgs(raw.args ?? [])
    };
  }
  if (kind === "open_url") {
    return {
      type: "url",
      url: cleanOptionalString(raw.url, "Action url")
    };
  }
  if (kind === "skill_invoke") {
    return {
      type: "skill",
      id: cleanOptionalString(raw.skill, "Action skill")
    };
  }
  if (kind === "copy_text" || kind === "insert_text") {
    return {
      type: "text",
      preview: cleanOptionalString(raw.text ?? raw.value, "Action text")
    };
  }
  return { type: "unknown" };
}

function normalizeProfile(input) {
  const raw = expectPlainObject(input, "Profile");
  const env = normalizeEnvForDisplay(raw.env ?? {});
  return {
    id: cleanRequiredString(raw.id, "Profile id"),
    label: cleanRequiredString(raw.label ?? raw.name ?? raw.id, "Profile label"),
    command: cleanRequiredString(raw.command, "Profile command"),
    args: normalizeScalars(raw.args ?? []),
    cwd: cleanOptionalString(raw.cwd, "Profile cwd"),
    inheritEnv: raw.inheritEnv ?? raw.inherit_env ?? true,
    env,
    summary: {
      envCount: env.length,
      redactedEnvCount: env.filter((entry) => entry.redacted).length
    }
  };
}

function normalizeEnvForDisplay(env) {
  const raw = expectPlainObject(env, "Profile env");
  return Object.entries(raw)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => {
      const textValue = value === undefined || value === null ? "" : String(value);
      const redacted = isSensitiveEnvEntry(name, textValue);
      return {
        name,
        value: redacted ? REDACTED_VALUE : textValue,
        redacted
      };
    });
}

function normalizeActionArgs(values) {
  const args = normalizeScalars(values);
  return args.map((value, index) => {
    if (isSensitiveInlineArg(value) || SENSITIVE_VALUE.test(value)) {
      return redactInlineArg(value);
    }
    if (index > 0 && isSensitiveArgName(args[index - 1])) {
      return REDACTED_VALUE;
    }
    return value;
  });
}

function isSensitiveInlineArg(value) {
  const separator = value.indexOf("=");
  if (separator === -1) {
    return false;
  }
  return isSensitiveArgName(value.slice(0, separator));
}

function redactInlineArg(value) {
  const separator = value.indexOf("=");
  if (separator === -1) {
    return REDACTED_VALUE;
  }
  return `${value.slice(0, separator + 1)}${REDACTED_VALUE}`;
}

function isSensitiveArgName(value) {
  return SENSITIVE_ENV_NAME.test(String(value).replace(/^-+/, ""));
}

function normalizeModels(input) {
  const models = input === undefined
    ? [DEFAULT_MODEL_CARD]
    : normalizeArray(input, "Models").map(normalizeModel);
  return models.length === 0 ? [DEFAULT_MODEL_CARD] : models;
}

function normalizeModel(input) {
  const raw = expectPlainObject(input, "Model");
  const artifacts = normalizeArray(raw.artifacts ?? [], "Model artifacts");
  return {
    id: cleanRequiredString(raw.id, "Model id"),
    name: cleanOptionalString(raw.name, "Model name") ?? cleanRequiredString(raw.id, "Model id"),
    role: cleanOptionalString(raw.role, "Model role"),
    status: cleanOptionalString(raw.status ?? raw.runtimeStatus, "Model status") ?? "unknown",
    source: normalizeModelSource(raw.source ?? {}),
    artifactCount: raw.artifactCount ?? raw.artifact_count ?? artifacts.length,
    benchmark: normalizeBenchmark(raw.benchmark ?? {}),
    audit: normalizeAudit(raw.audit)
  };
}

function normalizeModelSource(input) {
  const raw = expectPlainObject(input, "Model source");
  return {
    type: cleanOptionalString(raw.type, "Model source type"),
    repository: cleanOptionalString(raw.repository, "Model source repository"),
    url: cleanOptionalString(raw.url, "Model source url"),
    license: cleanOptionalString(raw.license, "Model source license")
  };
}

function normalizeBenchmark(input) {
  const raw = expectPlainObject(input, "Model benchmark");
  return {
    iterations: normalizeOptionalInteger(raw.iterations, "Benchmark iterations"),
    warmup: normalizeOptionalInteger(raw.warmup, "Benchmark warmup"),
    timeoutMs: normalizeOptionalInteger(raw.timeoutMs ?? raw.timeout_ms, "Benchmark timeoutMs"),
    medianMs: normalizeOptionalInteger(raw.medianMs ?? raw.median_ms, "Benchmark medianMs"),
    status: cleanOptionalString(raw.status, "Benchmark status")
  };
}

function normalizeAudit(input) {
  if (input === undefined || input === null) {
    return undefined;
  }
  const raw = expectPlainObject(input, "Model audit");
  return {
    status: cleanOptionalString(raw.status ?? raw.summary?.status, "Audit status") ?? "unknown",
    issueCount: normalizeOptionalInteger(raw.issueCount ?? raw.summary?.issueCount, "Audit issue count"),
    unmanagedFileCount: normalizeOptionalInteger(
      raw.unmanagedFileCount ?? raw.summary?.unmanagedFileCount,
      "Audit unmanaged file count"
    )
  };
}

function normalizeImportPreviews(input) {
  return normalizeArray(input ?? [], "Imports").map((item) => {
    const raw = expectPlainObject(item, "Import preview");
    const summary = expectPlainObject(raw.summary ?? {}, "Import summary");
    return {
      source: cleanOptionalString(raw.source, "Import source") ?? "unknown",
      format: cleanOptionalString(raw.format, "Import format") ?? "unknown",
      outputPath: cleanOptionalString(raw.outputPath ?? raw.output_path, "Import output path"),
      rollbackId: cleanOptionalString(raw.rollbackId ?? raw.rollback_id, "Import rollback id"),
      summary: {
        parsedRows: normalizeOptionalInteger(summary.parsedRows, "Parsed rows") ?? 0,
        acceptedRows: normalizeOptionalInteger(summary.acceptedRows, "Accepted rows") ?? 0,
        rejectedRows: normalizeOptionalInteger(summary.rejectedRows, "Rejected rows") ?? 0,
        duplicateRows: normalizeOptionalInteger(summary.duplicateRows, "Duplicate rows") ?? 0,
        importedEntries: normalizeOptionalInteger(summary.importedEntries, "Imported entries") ?? 0
      },
      privateEntriesOmitted: Array.isArray(raw.entries) && raw.entries.length > 0
    };
  });
}

function normalizeInputMethodSettings(input) {
  const raw = input === undefined || input === null
    ? {}
    : expectPlainObject(input, "Input method settings");
  return {
    status: cleanOptionalString(raw.status, "Input method settings status") ?? "unknown",
    outputScript: cleanOptionalString(
      raw.outputScript ?? raw.output_script,
      "Input method output script"
    ) ?? "unknown",
    colorScheme: cleanOptionalString(
      raw.colorScheme ?? raw.color_scheme,
      "Input method color scheme"
    ) ?? "unknown",
    candidateLayout: cleanOptionalString(
      raw.candidateLayout ?? raw.candidate_layout,
      "Input method candidate layout"
    ) ?? "unknown",
    textOrientation: cleanOptionalString(
      raw.textOrientation ?? raw.text_orientation,
      "Input method text orientation"
    ) ?? "unknown",
    pageSize: normalizeOptionalInteger(raw.pageSize ?? raw.page_size, "Input method page size"),
    fontPoint: normalizeOptionalInteger(raw.fontPoint ?? raw.font_point, "Input method font point"),
    cornerRadius: normalizeOptionalInteger(
      raw.cornerRadius ?? raw.corner_radius,
      "Input method corner radius"
    ),
    inlinePreedit: normalizeOptionalBoolean(
      raw.inlinePreedit ?? raw.inline_preedit,
      "Input method inline preedit"
    ),
    englishPunctuation: normalizeOptionalBoolean(
      raw.englishPunctuation ?? raw.english_punctuation,
      "Input method englishPunctuation"
    ),
    customSkin: normalizeInputMethodSkin(raw.customSkin ?? raw.custom_skin),
    customSkinName: cleanOptionalString(
      raw.customSkinName ?? raw.custom_skin_name,
      "Input method custom skin name"
    ) ?? cleanOptionalString(raw.customSkin?.name ?? raw.custom_skin?.name, "Input method custom skin name"),
    aiSkinAssistant: normalizeAiSkinAssistant(raw.aiSkinAssistant ?? raw.ai_skin_assistant),
    predictor: normalizePredictorStatus(raw.predictor)
  };
}

function normalizeInputMethodSkin(input) {
  const raw = input === undefined || input === null
    ? {}
    : expectPlainObject(input, "Input method custom skin");
  return {
    name: cleanOptionalString(raw.name, "Input method custom skin name")
      ?? DEFAULT_INPUT_METHOD_SKIN.name,
    backColor: normalizeHexColor(raw.backColor ?? raw.back_color, "Input method skin background")
      ?? DEFAULT_INPUT_METHOD_SKIN.backColor,
    borderColor: normalizeHexColor(raw.borderColor ?? raw.border_color, "Input method skin border")
      ?? DEFAULT_INPUT_METHOD_SKIN.borderColor,
    textColor: normalizeHexColor(raw.textColor ?? raw.text_color, "Input method skin preedit text")
      ?? DEFAULT_INPUT_METHOD_SKIN.textColor,
    candidateTextColor: normalizeHexColor(
      raw.candidateTextColor ?? raw.candidate_text_color,
      "Input method skin candidate text"
    ) ?? DEFAULT_INPUT_METHOD_SKIN.candidateTextColor,
    commentTextColor: normalizeHexColor(
      raw.commentTextColor ?? raw.comment_text_color,
      "Input method skin comment text"
    ) ?? DEFAULT_INPUT_METHOD_SKIN.commentTextColor,
    labelColor: normalizeHexColor(raw.labelColor ?? raw.label_color, "Input method skin label")
      ?? DEFAULT_INPUT_METHOD_SKIN.labelColor,
    highlightedBackColor: normalizeHexColor(
      raw.highlightedBackColor ?? raw.highlighted_back_color,
      "Input method skin highlighted background"
    ) ?? DEFAULT_INPUT_METHOD_SKIN.highlightedBackColor,
    highlightedTextColor: normalizeHexColor(
      raw.highlightedTextColor ?? raw.highlighted_text_color,
      "Input method skin highlighted text"
    ) ?? DEFAULT_INPUT_METHOD_SKIN.highlightedTextColor,
    highlightedLabelColor: normalizeHexColor(
      raw.highlightedLabelColor ?? raw.highlighted_label_color,
      "Input method skin highlighted label"
    ) ?? DEFAULT_INPUT_METHOD_SKIN.highlightedLabelColor,
    highlightedCommentColor: normalizeHexColor(
      raw.highlightedCommentColor ?? raw.highlighted_comment_color,
      "Input method skin highlighted comment"
    ) ?? DEFAULT_INPUT_METHOD_SKIN.highlightedCommentColor
  };
}

function normalizeAiSkinAssistant(input) {
  const raw = input === undefined || input === null
    ? {}
    : expectPlainObject(input, "AI skin assistant");
  return {
    provider: cleanOptionalString(raw.provider, "AI skin assistant provider") ?? "deepseek",
    model: cleanOptionalString(raw.model, "AI skin assistant model") ?? "deepseek-v4-flash",
    status: cleanOptionalString(raw.status, "AI skin assistant status") ?? "available"
  };
}

function normalizePredictorStatus(input) {
  const raw = input === undefined || input === null
    ? {}
    : expectPlainObject(input, "Predictor status");
  return {
    enabled: normalizeOptionalBoolean(raw.enabled, "Predictor enabled") ?? false,
    status: cleanOptionalString(raw.status, "Predictor status") ?? "unknown",
    service: cleanOptionalString(raw.service, "Predictor service") ?? "unknown",
    running: normalizeOptionalBoolean(raw.running, "Predictor running") ?? false,
    endpoint: cleanOptionalString(raw.endpoint, "Predictor endpoint"),
    mode: cleanOptionalString(raw.mode, "Predictor mode") ?? "unknown",
    modelStatus: cleanOptionalString(raw.modelStatus ?? raw.model_status, "Predictor model status") ?? "unknown",
    modelName: cleanOptionalString(raw.modelName ?? raw.model_name, "Predictor model name"),
    modelDir: cleanOptionalString(raw.modelDir ?? raw.model_dir, "Predictor model directory"),
    timeoutMs: normalizeOptionalInteger(raw.timeoutMs ?? raw.timeout_ms, "Predictor timeout ms"),
    candidateLimit: normalizeOptionalInteger(
      raw.candidateLimit ?? raw.candidate_limit,
      "Predictor candidate limit"
    ),
    minCodeLength: normalizeOptionalInteger(
      raw.minCodeLength ?? raw.min_code_length,
      "Predictor minimum code length"
    ),
    luaInstalled: normalizeOptionalBoolean(raw.luaInstalled ?? raw.lua_installed, "Predictor Lua installed") ?? false,
    filterPatched: normalizeOptionalBoolean(raw.filterPatched ?? raw.filter_patched, "Predictor filter patched") ?? false,
    lexiconEntryCount: normalizeOptionalInteger(
      raw.lexiconEntryCount ?? raw.lexicon_entry_count,
      "Predictor lexicon entry count"
    ),
    runner: normalizePredictorRunner(raw.runner),
    error: cleanOptionalString(raw.error, "Predictor error")
  };
}

function normalizePredictorRunner(input) {
  const raw = input === undefined || input === null
    ? {}
    : expectPlainObject(input, "Predictor runner");
  return {
    provider: cleanOptionalString(raw.provider, "Predictor runner provider") ?? "none",
    enabled: normalizeOptionalBoolean(raw.enabled, "Predictor runner enabled") ?? false,
    configured: normalizeOptionalBoolean(raw.configured, "Predictor runner configured") ?? false,
    endpoint: cleanOptionalString(raw.endpoint, "Predictor runner endpoint"),
    model: cleanOptionalString(raw.model, "Predictor runner model"),
    timeoutMs: normalizeOptionalInteger(raw.timeoutMs ?? raw.timeout_ms, "Predictor runner timeout"),
    cacheSize: normalizeOptionalInteger(raw.cacheSize ?? raw.cache_size, "Predictor runner cache size") ?? 0,
    pendingCount: normalizeOptionalInteger(raw.pendingCount ?? raw.pending_count, "Predictor runner pending count") ?? 0,
    lastSuccessAt: cleanOptionalString(
      raw.lastSuccessAt ?? raw.last_success_at,
      "Predictor runner last success"
    ),
    lastError: cleanOptionalString(raw.lastError ?? raw.last_error, "Predictor runner last error")
  };
}

function normalizeMaintenanceJobs(input) {
  return normalizeArray(input ?? [], "Maintenance jobs").map((item) => {
    const raw = expectPlainObject(item, "Maintenance job");
    const scope = normalizeArray(raw.scope ?? [], "Maintenance scope");
    return {
      id: cleanRequiredString(raw.id, "Maintenance job id"),
      kind: cleanRequiredString(raw.kind, "Maintenance job kind"),
      model: cleanOptionalString(raw.model, "Maintenance job model"),
      status: cleanOptionalString(raw.status, "Maintenance job status") ?? "unknown",
      privacyMode: cleanOptionalString(
        raw.privacyMode ?? raw.privacy_mode,
        "Maintenance privacy mode"
      ) ?? "redacted",
      budgetCents: normalizeOptionalInteger(
        raw.budgetCents ?? raw.budget_cents,
        "Maintenance budget cents"
      ),
      scopeCount: scope.length,
      diffStatus: cleanOptionalString(raw.diffStatus ?? raw.diff_status, "Maintenance diff status")
    };
  });
}

function normalizeReleaseChecks(input) {
  if (input === undefined || input === null) {
    return [
      { id: "license", label: "LICENSE", status: "unknown" },
      { id: "notice", label: "NOTICE", status: "unknown" },
      { id: "third-party", label: "THIRD_PARTY_NOTICES.md", status: "unknown" },
      { id: "models", label: "MODEL_LICENSES.md", status: "unknown" },
      { id: "release-gate", label: "npm run release:check", status: "unknown" }
    ];
  }

  const checks = Array.isArray(input)
    ? input
    : expectPlainObject(input, "Release input").checks ?? [];

  return normalizeArray(checks, "Release checks").map((item) => {
    const raw = expectPlainObject(item, "Release check");
    return {
      id: cleanRequiredString(raw.id ?? raw.label, "Release check id"),
      label: cleanRequiredString(raw.label ?? raw.id, "Release check label"),
      status: normalizeStatus(raw.status ?? "unknown"),
      detail: cleanOptionalString(raw.detail, "Release check detail"),
      command: cleanOptionalString(raw.command, "Release check command")
    };
  });
}

function buildSummary(parts) {
  const releaseStatus = aggregateStatus(parts.releaseChecks.map((check) => check.status));
  return {
    quickDictionaryEntries: parts.quickDictionary.customSummary.entryCount,
    actions: parts.actions.length,
    executableActions: parts.actions.filter((action) => action.category === "executable").length,
    confirmationActions: parts.actions.filter((action) => action.requiresConfirmation).length,
    profiles: parts.profiles.length,
    models: parts.models.length,
    imports: parts.imports.length,
    maintenanceJobs: parts.maintenanceJobs.length,
    releaseStatus
  };
}

function aggregateStatus(statuses) {
  if (statuses.includes("fail")) {
    return "fail";
  }
  if (statuses.includes("warn")) {
    return "warn";
  }
  if (statuses.every((status) => status === "pass")) {
    return "pass";
  }
  return "unknown";
}

function normalizeStatus(value) {
  const status = cleanRequiredString(value, "Status").toLowerCase();
  if (["pass", "fail", "warn", "unknown"].includes(status)) {
    return status;
  }
  return "unknown";
}

function normalizeArray(value, name) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${name} must be an array.`);
  }
  return value;
}

function normalizeScalars(values) {
  return normalizeArray(values, "Scalar list").map((value) => {
    if (value === null || value === undefined || typeof value === "object") {
      throw new TypeError("Scalar list values must be strings, numbers, or booleans.");
    }
    return String(value);
  });
}

function average(numbers) {
  if (numbers.length === 0) {
    return 0;
  }
  return Math.round(numbers.reduce((sum, number) => sum + number, 0) / numbers.length);
}

function normalizeInteger(value, name, options = {}) {
  const number = Number(value);
  const min = options.min ?? Number.MIN_SAFE_INTEGER;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }
  return number;
}

function normalizeOptionalInteger(value, name) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return normalizeInteger(value, name, { min: 0 });
}

function normalizeOptionalBoolean(value, name) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new TypeError(`${name} must be a boolean.`);
  }
  return value;
}

function cleanOptionalString(value, name) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return cleanRequiredString(value, name);
}

function normalizeHexColor(value, name) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const text = cleanRequiredString(value, name).toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(text)) {
    throw new Error(`${name} must be a #RRGGBB color.`);
  }
  return text;
}

function cleanRequiredString(value, name) {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string.`);
  }
  const text = value.trim();
  if (text.length === 0) {
    throw new Error(`${name} must not be empty.`);
  }
  return text;
}

function expectPlainObject(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return value;
}
