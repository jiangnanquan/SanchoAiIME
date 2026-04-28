export const DEFAULT_DASHBOARD_TITLE = "SanchoAiIME Dashboard";

const DEFAULT_MODEL_CARD = {
  id: "qwen3.5-0.8b",
  name: "Qwen3.5-0.8B",
  role: "local-realtime-predictor",
  status: "not-configured",
  source: {
    type: "huggingface",
    repository: "Qwen/Qwen3.5-0.8B",
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

export function createDashboardViewModel(input = {}) {
  const raw = expectPlainObject(input, "Dashboard input");
  const title = cleanOptionalString(raw.title, "Dashboard title") ?? DEFAULT_DASHBOARD_TITLE;
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
      { id: "quick-dictionary", label: "Dictionary" },
      { id: "actions", label: "Actions" },
      { id: "profiles", label: "Profiles" },
      { id: "models", label: "Models" },
      { id: "imports", label: "Imports" },
      { id: "maintenance", label: "Maintenance" },
      { id: "release", label: "Release" }
    ],
    quickDictionary,
    actions: registry.actions,
    profiles: registry.profiles,
    models,
    imports,
    maintenanceJobs,
    releaseChecks
  };
}

export function createSampleDashboardInput() {
  return {
    title: DEFAULT_DASHBOARD_TITLE,
    quickDictionary: {
      path: "/Users/jnq/Library/Rime/custom_phrase.txt",
      managedRegionStatus: "ready",
      entries: [
        { surface: "SanchoExo Codex DeepSeek", code: "cds", weight: 99 },
        { surface: "Qwen local predictor", code: "qwp", weight: 90 }
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
          label: "Qwen local predictor",
          kind: "insert_text",
          text: "Qwen local predictor",
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
          label: "Run release gate",
          kind: "run_command",
          command: "npm",
          args: ["run", "release:check"],
          risk: "confirm",
          weight: 80
        }
      ]
    },
    models: [
      {
        id: "qwen3.5-0.8b",
        name: "Qwen3.5-0.8B",
        role: "local-realtime-predictor",
        status: "planned",
        source: {
          type: "huggingface",
          repository: "Qwen/Qwen3.5-0.8B",
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
      averageWeight: average(entries.map((entry) => entry.weight))
    },
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
    quickDictionaryEntries: parts.quickDictionary.entries.length,
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

function cleanOptionalString(value, name) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return cleanRequiredString(value, name);
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
