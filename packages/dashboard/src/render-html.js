import { createDashboardViewModel } from "./view-model.js";
import { createTranslator, normalizeLocale } from "./i18n.js";

const INPUT_METHOD_COLOR_SCHEMES = [
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
];

const INPUT_METHOD_SKIN_PRESETS = {
  sancho_mist: {
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
  },
  sancho_graphite: {
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
  },
  sancho_paper: {
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
  },
  sancho_ocean: {
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
  }
};

const INPUT_METHOD_DEFAULT_SKIN = {
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
};

const INPUT_METHOD_COLOR_FIELDS = [
  ["backColor", "inputMethod.backColor"],
  ["borderColor", "inputMethod.borderColor"],
  ["textColor", "inputMethod.textColor"],
  ["candidateTextColor", "inputMethod.candidateTextColor"],
  ["commentTextColor", "inputMethod.commentTextColor"],
  ["labelColor", "inputMethod.labelColor"],
  ["highlightedBackColor", "inputMethod.highlightedBackColor"],
  ["highlightedTextColor", "inputMethod.highlightedTextColor"],
  ["highlightedLabelColor", "inputMethod.highlightedLabelColor"],
  ["highlightedCommentColor", "inputMethod.highlightedCommentColor"]
];

export function renderDashboardHtml(input = {}, options = {}) {
  const locale = normalizeLocale(options.locale ?? options.lang);
  const { t } = createTranslator(locale);
  const model = input.schemaVersion === 1 && input.navigation
    ? input
    : createDashboardViewModel(input, { locale });
  const lang = options.lang ?? locale;

  return `<!doctype html>
<html lang="${escapeAttribute(lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(model.title)}</title>
  <style>${CSS}</style>
</head>
<body>
  <script>window.SANCHO_DASHBOARD_STATE=${safeJsonForHtml(model)};</script>
  <div class="dashboard-chrome">
    <header class="app-header">
      <div>
        <p class="eyebrow">SanchoAiIME</p>
        <h1>${escapeHtml(model.title)}</h1>
      </div>
      <div class="header-status">
        ${statPill(t("summary.dictionary"), model.summary.quickDictionaryEntries)}
        ${statPill(t("summary.actions"), model.summary.actions)}
        ${statusPill(t("summary.release"), model.summary.releaseStatus, t)}
      </div>
    </header>
    <nav class="tabs" aria-label="${escapeAttribute(t("dashboard.title"))}">
      ${model.navigation.map((item, index) => `
        <button class="tab${index === 0 ? " is-active" : ""}" type="button" data-tab="${escapeAttribute(item.id)}" aria-controls="${escapeAttribute(item.id)}">${escapeHtml(item.label)}</button>
      `).join("")}
    </nav>
  </div>
  <main class="dashboard-main">
    ${section("quick-dictionary", t("section.quickDictionary"), renderQuickDictionary(model.quickDictionary, t), true)}
    ${section("input-method", t("section.inputMethod"), renderInputMethod(model.inputMethodSettings, t))}
    ${section("actions", t("section.actions"), renderActions(model.actions, t))}
    ${section("profiles", t("section.profiles"), renderProfiles(model.profiles, t))}
    ${section("models", t("section.models"), renderModels(model.models, t))}
    ${section("imports", t("section.imports"), renderImports(model.imports, t))}
    ${section("maintenance", t("section.maintenance"), renderMaintenance(model.maintenanceJobs, t))}
    ${section("release", t("section.release"), renderRelease(model.releaseChecks, t))}
  </main>
  ${renderActionConfirmDialog()}
  <script>${clientJs(t)}</script>
</body>
</html>
`;
}

export function safeJsonForHtml(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function section(id, title, body, active = false) {
  return `<section id="${escapeAttribute(id)}" class="panel${active ? " is-active" : ""}" data-panel="${escapeAttribute(id)}" aria-labelledby="${escapeAttribute(id)}-heading">
    <div class="section-heading">
      <h2 id="${escapeAttribute(id)}-heading">${escapeHtml(title)}</h2>
    </div>
    ${body}
  </section>`;
}

function renderQuickDictionary(dictionary, t) {
  const editableRows = renderCustomPhraseEditorRows(dictionary.customEntries);
  const managedRows = dictionary.entries.map((entry) => `
    <tr>
      <td>${badge(t("quickDictionary.managedPhrase"), "neutral")}</td>
      <td>${escapeHtml(entry.surface)}</td>
      <td><code>${escapeHtml(entry.code)}</code></td>
      <td class="numeric">${entry.weight}</td>
    </tr>
  `).join("");
  const invalidRows = dictionary.invalidRows.map((row) => `
    <tr>
      <td class="numeric">${row.lineNumber ?? ""}</td>
      <td><code>${escapeHtml(row.raw)}</code></td>
      <td>${escapeHtml(row.reason)}</td>
    </tr>
  `).join("");

  return `
    <div class="summary-grid">
      ${metric(t("quickDictionary.customEntries"), dictionary.customSummary.userEntryCount)}
      ${metric(t("metric.managedEntries"), dictionary.customSummary.managedEntryCount)}
      ${metric(t("quickDictionary.comments"), dictionary.customSummary.commentRowCount)}
      ${metric(t("metric.region"), displayValue("status", dictionary.managedRegionStatus, t))}
    </div>
    <p class="path-line"><span>${escapeHtml(t("label.path"))}</span><code>${escapeHtml(dictionary.path)}</code></p>
    <div class="dictionary-layout">
      <div class="dictionary-editor-panel">
        <div class="editor-heading">
          <h3>${escapeHtml(t("quickDictionary.customTitle"))}</h3>
          <div class="editor-actions">
            <button type="button" data-add-custom-phrase>${escapeHtml(t("quickDictionary.addPhrase"))}</button>
            <button class="primary-button" type="button" data-save-custom-phrases>${escapeHtml(t("quickDictionary.savePhrases"))}</button>
          </div>
        </div>
        <div class="table-wrap editable-table-wrap">
          <table class="editable-table custom-phrase-table">
            <thead>
              <tr>
                <th>${escapeHtml(t("table.surface"))}</th>
                <th>${escapeHtml(t("table.code"))}</th>
                <th>${escapeHtml(t("table.weight"))}</th>
                <th>${escapeHtml(t("table.position"))}</th>
                <th>${escapeHtml(t("table.line"))}</th>
                <th></th>
              </tr>
            </thead>
            <tbody data-custom-phrase-body>${editableRows}</tbody>
          </table>
        </div>
        <span class="form-status" data-custom-phrase-status></span>
      </div>
      <div>
        <h3>${escapeHtml(t("quickDictionary.managedTitle"))}</h3>
        ${table([t("table.type"), t("table.surface"), t("table.code"), t("table.weight")], managedRows, t("empty.quickDictionary"))}
      </div>
      ${invalidRows ? `<div><h3>${escapeHtml(t("quickDictionary.invalidTitle"))}</h3>${table([t("table.line"), t("table.raw"), t("table.reason")], invalidRows, "")}</div>` : ""}
    </div>
  `;
}

function renderCustomPhraseEditorRows(entries) {
  if (entries.length === 0) {
    return "";
  }
  return entries.map((entry) => customPhraseEditorRow(entry)).join("");
}

function customPhraseEditorRow(entry = {}) {
  return `<tr data-custom-phrase-row>
    <td><input data-custom-phrase-field="surface" type="text" value="${escapeAttribute(entry.surface ?? "")}" placeholder="Qwen 本地预测"></td>
    <td><input data-custom-phrase-field="code" type="text" value="${escapeAttribute(entry.code ?? "")}" placeholder="qwp"></td>
    <td><input data-custom-phrase-field="weight" type="number" min="0" max="999999" step="1" value="${escapeAttribute(entry.weight ?? 99)}"></td>
    <td><input data-custom-phrase-field="candidatePosition" type="number" min="1" max="9" step="1" value="${escapeAttribute(entry.candidatePosition ?? "")}" placeholder="自动"></td>
    <td class="numeric">${entry.lineNumber ?? ""}</td>
    <td class="button-cell"><button class="icon-button" type="button" data-remove-custom-phrase title="删除" aria-label="删除">×</button></td>
  </tr>`;
}

function renderInputMethod(settings = {}, t) {
  const aiSkinAssistant = settings.aiSkinAssistant ?? {};
  const customSkin = settings.customSkin ?? INPUT_METHOD_DEFAULT_SKIN;
  const predictor = settings.predictor ?? {};
  const outputScript = settings.outputScript ?? "simplified";
  const candidateLayout = settings.candidateLayout ?? "stacked";
  const textOrientation = settings.textOrientation ?? "horizontal";
  const colorScheme = settings.colorScheme ?? "sancho_mist";
  const pageSize = settings.pageSize ?? 5;
  const fontPoint = settings.fontPoint ?? 16;
  const cornerRadius = settings.cornerRadius ?? 7;

  return `
    <div class="summary-grid">
      ${metric(t("inputMethod.skin"), displayOptionalValue("inputMethod", settings.colorScheme, t))}
      ${metric(t("inputMethod.candidates"), settings.pageSize ?? t("status.unknown"))}
      ${metric(t("inputMethod.predictor"), displayValue("status", predictor.status ?? "unknown", t))}
      ${metric(t("inputMethod.ai"), `${aiSkinAssistant.provider ?? "deepseek"} / ${aiSkinAssistant.model ?? "deepseek-v4-flash"}`)}
    </div>
    <form class="input-method-form" data-input-method-form>
      <div class="input-method-grid">
        <div class="input-panel">
          <h3>${escapeHtml(t("inputMethod.outputAndBehavior"))}</h3>
          ${fieldRow(t("inputMethod.outputScript"), segmented("outputScript", [
            ["simplified", t("inputMethod.simplified")],
            ["traditional", t("inputMethod.traditional")]
          ], outputScript))}
          ${fieldRow(t("inputMethod.pageSize"), rangeInput("pageSize", pageSize, 3, 9))}
          ${fieldRow(t("inputMethod.inlinePreedit"), `<input id="im-inline-preedit" name="inlinePreedit" type="checkbox"${settings.inlinePreedit === false ? "" : " checked"}>`)}
          ${fieldRow(t("inputMethod.predictorEnabled"), `<input id="im-predictor-enabled" name="predictorEnabled" type="checkbox"${predictor.enabled === false ? "" : " checked"}>`)}
          <div class="predictor-status">
            <span>${escapeHtml(t("inputMethod.predictorStatus"))}</span>
            <strong>${escapeHtml(predictorStatusText(predictor, t))}</strong>
          </div>
          ${fieldRow(t("inputMethod.predictorRunner"), `<select id="im-predictor-runner" name="predictorRunner">${renderPredictorRunnerOptions(predictor.runner?.provider, t)}</select>`)}
          ${fieldRow(t("inputMethod.predictorHttpEndpoint"), `<input id="im-predictor-http-endpoint" name="predictorHttpEndpoint" type="text" value="${escapeAttribute(predictor.runner?.endpoint ?? "")}" placeholder="http://127.0.0.1:18841/predict">`)}
          ${fieldRow(t("inputMethod.predictorOllamaModel"), `<input id="im-predictor-ollama-model" name="predictorOllamaModel" type="text" value="${escapeAttribute(predictor.runner?.model ?? "")}" placeholder="qwen2.5:0.5b">`)}
          <div class="input-method-actions">
            <button class="primary-button" type="submit" data-save-rime-settings>${escapeHtml(t("inputMethod.save"))}</button>
            <button type="button" data-open-rime-directory>${escapeHtml(t("inputMethod.openDirectory"))}</button>
            <span class="form-status" data-input-method-status></span>
          </div>
        </div>

        <div class="input-panel">
          <h3>${escapeHtml(t("inputMethod.candidateWindow"))}</h3>
          ${fieldRow(t("inputMethod.candidateLayout"), segmented("candidateLayout", [
            ["stacked", t("inputMethod.stacked")],
            ["linear", t("inputMethod.linear")]
          ], candidateLayout))}
          ${fieldRow(t("inputMethod.textOrientation"), segmented("textOrientation", [
            ["horizontal", t("inputMethod.horizontal")],
            ["vertical", t("inputMethod.vertical")]
          ], textOrientation))}
          ${fieldRow(t("inputMethod.fontPoint"), rangeInput("fontPoint", fontPoint, 12, 24))}
          ${fieldRow(t("inputMethod.cornerRadius"), rangeInput("cornerRadius", cornerRadius, 0, 16))}
        </div>

        <div class="input-panel preview-panel live-preview-panel">
          <h3>${escapeHtml(t("inputMethod.skinPreview"))}</h3>
          ${fieldRow(t("inputMethod.previewCode"), `<input id="im-preview-code" data-preview-code type="text" value="qwp" autocomplete="off" spellcheck="false" placeholder="qwp">`)}
          <div class="preview-stage">
            <div class="composition-line" data-preview-composition>qwp</div>
            <div class="candidate-preview" data-candidate-preview></div>
          </div>
        </div>

        <div class="input-panel skin-panel">
          <h3>${escapeHtml(t("inputMethod.skinEditor"))}</h3>
          ${fieldRow(t("inputMethod.colorScheme"), `<select id="im-color-scheme" name="colorScheme">${renderInputMethodColorOptions(colorScheme, t)}</select>`)}
          ${fieldRow(t("inputMethod.customSkinName"), `<input id="im-custom-skin-name" name="customSkinName" type="text" maxlength="40" value="${escapeAttribute(customSkin.name)}">`)}
          <div class="color-grid">
            ${INPUT_METHOD_COLOR_FIELDS.map(([field, labelKey]) => `
              <label class="color-field">
                <span>${escapeHtml(t(labelKey))}</span>
                <input type="color" data-skin-field="${escapeAttribute(field)}" value="${escapeAttribute(customSkin[field] ?? INPUT_METHOD_DEFAULT_SKIN[field])}">
              </label>
            `).join("")}
          </div>
          <div class="ai-skin-box">
            <label>
              <span>${escapeHtml(t("inputMethod.aiPrompt"))}</span>
              <textarea data-ai-skin-prompt placeholder="${escapeAttribute(t("inputMethod.aiPlaceholder"))}"></textarea>
            </label>
            <button type="button" data-generate-rime-skin>${escapeHtml(t("inputMethod.aiGenerate"))}</button>
          </div>
        </div>

        <div class="input-panel flash-panel">
          <h3>${escapeHtml(t("inputMethod.flashService"))}</h3>
          ${fieldRow(t("inputMethod.deepSeekStatus"), `<span class="credential-status" data-deepseek-status>${escapeHtml(t("status.unknown"))}</span>`)}
          <label class="credential-field">
            <span>${escapeHtml(t("inputMethod.deepSeekKey"))}</span>
            <input type="password" data-deepseek-key autocomplete="off" placeholder="${escapeAttribute(t("inputMethod.deepSeekPlaceholder"))}">
          </label>
          <div class="credential-actions">
            <button type="button" data-save-deepseek-key>${escapeHtml(t("inputMethod.deepSeekSave"))}</button>
            <button type="button" data-delete-deepseek-key>${escapeHtml(t("inputMethod.deepSeekDelete"))}</button>
            <button type="button" data-refresh-deepseek>${escapeHtml(t("inputMethod.deepSeekRefresh"))}</button>
          </div>
        </div>
      </div>
    </form>
  `;
}

function fieldRow(label, control) {
  return `<label class="field-row"><span>${escapeHtml(label)}</span>${control}</label>`;
}

function segmented(name, options, value) {
  return `<span class="segmented">${options.map(([optionValue, label]) => `
    <label>
      <input type="radio" name="${escapeAttribute(name)}" value="${escapeAttribute(optionValue)}"${optionValue === value ? " checked" : ""}>
      <span>${escapeHtml(label)}</span>
    </label>
  `).join("")}</span>`;
}

function rangeInput(name, value, min, max) {
  return `<span class="range-field">
    <input id="im-${escapeAttribute(name)}" name="${escapeAttribute(name)}" type="range" min="${min}" max="${max}" step="1" value="${escapeAttribute(value)}">
    <output data-range-output="${escapeAttribute(name)}">${escapeHtml(value)}</output>
  </span>`;
}

function renderInputMethodColorOptions(currentValue, t) {
  return INPUT_METHOD_COLOR_SCHEMES.map((scheme) =>
    `<option value="${escapeAttribute(scheme)}"${scheme === currentValue ? " selected" : ""}>${escapeHtml(displayValue("inputMethod", scheme, t))}</option>`
  ).join("");
}

function renderPredictorRunnerOptions(currentValue, t) {
  return ["none", "http", "ollama"].map((provider) =>
    `<option value="${escapeAttribute(provider)}"${provider === currentValue ? " selected" : ""}>${escapeHtml(displayValue("inputMethod", `runner.${provider}`, t))}</option>`
  ).join("");
}

function renderActions(actions, t) {
  const rows = actions.map((action) => `
    <tr>
      <td>${escapeHtml(action.label)}</td>
      <td><code>${escapeHtml(action.code)}</code></td>
      <td>${badge(displayValue("category", action.category, t), action.category === "snippet" ? "neutral" : "accent")}</td>
      <td>${escapeHtml(action.kind)}</td>
      <td>${badge(displayValue("risk", action.risk, t), action.requiresConfirmation ? "warn" : "ok")}</td>
      <td>${escapeHtml(actionTargetText(action))}</td>
      <td class="button-cell">
        <button class="icon-button" type="button" title="${escapeAttribute(action.requiresConfirmation ? t("action.confirm") : t("action.preview"))}" aria-label="${escapeAttribute(action.requiresConfirmation ? t("action.confirm") : t("action.preview"))}" data-action-button data-action-id="${escapeAttribute(action.id)}" data-action-label="${escapeAttribute(action.label)}" data-action-kind="${escapeAttribute(action.kind)}" data-action-risk="${escapeAttribute(action.risk)}" data-action-target="${escapeAttribute(actionTargetText(action))}" data-requires-confirmation="${action.requiresConfirmation ? "true" : "false"}">
          ${action.requiresConfirmation ? "!" : ">"}
        </button>
      </td>
    </tr>
  `).join("");

  return table([t("table.label"), t("table.code"), t("table.type"), t("table.kind"), t("table.risk"), t("table.target"), ""], rows, t("empty.actions"));
}

function renderProfiles(profiles, t) {
  const rows = profiles.map((profile) => `
    <tr>
      <td>${escapeHtml(profile.label)}</td>
      <td><code>${escapeHtml(profile.command)}</code></td>
      <td>${escapeHtml(profile.args.join(" "))}</td>
      <td>${escapeHtml(profile.cwd ?? "")}</td>
      <td>${profile.inheritEnv ? "yes" : "no"}</td>
      <td>${renderEnv(profile.env)}</td>
    </tr>
  `).join("");

  return table([t("table.label"), t("table.command"), t("table.args"), t("table.cwd"), t("table.inherit"), t("table.env")], rows, t("empty.profiles"));
}

function renderModels(models, t) {
  const rows = models.map((model) => `
    <tr>
      <td>${escapeHtml(model.name)}</td>
      <td><code>${escapeHtml(model.id)}</code></td>
      <td>${escapeHtml(model.role ?? "")}</td>
      <td>${badge(displayValue("status", model.status, t), model.status === "ready" ? "ok" : "neutral")}</td>
      <td>${escapeHtml(model.source.repository ?? model.source.url ?? "")}</td>
      <td>${escapeHtml(model.source.license ?? "")}</td>
      <td class="numeric">${model.artifactCount}</td>
      <td>${benchmarkText(model.benchmark, t)}</td>
    </tr>
  `).join("");

  return table([t("table.name"), t("table.id"), t("table.role"), t("table.status"), t("table.source"), t("table.license"), t("table.artifacts"), t("table.benchmark")], rows, t("empty.models"));
}

function renderImports(imports, t) {
  const rows = imports.map((item) => `
    <tr>
      <td>${escapeHtml(item.source)}</td>
      <td>${escapeHtml(item.format)}</td>
      <td class="numeric">${item.summary.importedEntries}</td>
      <td class="numeric">${item.summary.duplicateRows}</td>
      <td class="numeric">${item.summary.rejectedRows}</td>
      <td>${item.privateEntriesOmitted ? badge(t("badge.entriesOmitted"), "warn") : badge(t("badge.summaryOnly"), "ok")}</td>
    </tr>
  `).join("");

  return table([t("table.source"), t("table.format"), t("table.imported"), t("table.duplicates"), t("table.rejected"), t("table.privacy")], rows, t("empty.imports"));
}

function renderMaintenance(jobs, t) {
  const rows = jobs.map((job) => `
    <tr>
      <td><code>${escapeHtml(job.id)}</code></td>
      <td>${escapeHtml(job.kind)}</td>
      <td>${escapeHtml(job.model ?? "")}</td>
      <td>${badge(displayValue("status", job.status, t), job.status === "ready" ? "ok" : "neutral")}</td>
      <td>${escapeHtml(job.privacyMode)}</td>
      <td class="numeric">${job.budgetCents ?? ""}</td>
      <td class="numeric">${job.scopeCount}</td>
      <td>${escapeHtml(job.diffStatus ?? "")}</td>
    </tr>
  `).join("");

  return table([t("table.id"), t("table.kind"), t("table.model"), t("table.status"), t("table.privacy"), t("table.budget"), t("table.scope"), t("table.diff")], rows, t("empty.maintenance"));
}

function renderRelease(checks, t) {
  const rows = checks.map((check) => `
    <tr>
      <td>${escapeHtml(check.label)}</td>
      <td>${badge(displayValue("status", check.status, t), statusTone(check.status))}</td>
      <td>${escapeHtml(check.detail ?? "")}</td>
      <td><code>${escapeHtml(check.command ?? "")}</code></td>
    </tr>
  `).join("");

  return table([t("table.check"), t("table.status"), t("table.detail"), t("table.command")], rows, t("empty.release"));
}

function renderActionConfirmDialog() {
  return `<dialog id="action-confirm-dialog" class="action-dialog" aria-labelledby="action-confirm-title">
    <form method="dialog">
      <h2 id="action-confirm-title">Confirm Action</h2>
      <dl class="action-dialog-details">
        <div>
          <dt>Action</dt>
          <dd data-dialog-action-label></dd>
        </div>
        <div>
          <dt>Kind</dt>
          <dd data-dialog-action-kind></dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd data-dialog-action-target></dd>
        </div>
      </dl>
      <menu>
        <button type="submit" value="cancel">Cancel</button>
        <button type="submit" value="confirm" data-confirm-action>Confirm</button>
      </menu>
    </form>
  </dialog>`;
}

function table(headers, rows, emptyMessage) {
  if (!rows) {
    return `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
  }
  return `<div class="table-wrap"><table>
    <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function renderEnv(entries) {
  if (entries.length === 0) {
    return "";
  }
  return `<div class="env-list">${entries.map((entry) =>
    `<span><code>${escapeHtml(entry.name)}</code>=${escapeHtml(entry.value)}</span>`
  ).join("")}</div>`;
}

function actionTargetText(action) {
  if (action.category === "snippet") {
    return action.insertPreview ?? action.target.preview ?? "";
  }
  if (action.target.type === "profile") {
    return action.target.label ?? action.target.id ?? "";
  }
  if (action.target.type === "command") {
    return [action.target.command, ...(action.target.args ?? [])].filter(Boolean).join(" ");
  }
  return action.target.url ?? action.target.id ?? "";
}

function benchmarkText(benchmark, t) {
  const parts = [];
  if (benchmark.iterations !== undefined) {
    parts.push(t("benchmark.runs", { count: benchmark.iterations }));
  }
  if (benchmark.medianMs !== undefined) {
    parts.push(t("benchmark.medianMs", { ms: benchmark.medianMs }));
  }
  if (benchmark.timeoutMs !== undefined) {
    parts.push(t("benchmark.timeoutMs", { ms: benchmark.timeoutMs }));
  }
  return escapeHtml(parts.join(" / "));
}

function predictorStatusText(predictor, t) {
  if (!predictor?.enabled) {
    return t("inputMethod.predictorDisabled");
  }
  const serviceText = predictor.running
    ? t("inputMethod.predictorServiceRunning")
    : t("inputMethod.predictorServiceStopped");
  const rimeText = predictor.luaInstalled && predictor.filterPatched
    ? t("inputMethod.predictorRimeReady")
    : t("inputMethod.predictorRimePending");
  const modelText = predictor.modelStatus
    ? displayValue("status", predictor.modelStatus, t)
    : t("status.unknown");
  const runnerText = predictorRunnerText(predictor.runner, t);
  return `${serviceText} / ${rimeText} / ${modelText} / ${runnerText}`;
}

function predictorRunnerText(runner, t) {
  if (!runner?.configured) {
    return t("inputMethod.predictorRunnerNotConfigured");
  }
  if (!runner.enabled) {
    return t("inputMethod.predictorRunnerDisabled");
  }
  const provider = displayValue("inputMethod", `runner.${runner.provider}`, t);
  const model = runner.model ? ` ${runner.model}` : "";
  return `${provider}${model}`;
}

function statPill(label, value) {
  return `<span class="pill"><span>${escapeHtml(label)}</span><strong>${value}</strong></span>`;
}

function statusPill(label, status, t) {
  return `<span class="pill ${statusTone(status)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(displayValue("status", status, t))}</strong></span>`;
}

function metric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function badge(label, tone) {
  return `<span class="badge ${escapeAttribute(tone)}">${escapeHtml(label)}</span>`;
}

function statusTone(status) {
  if (status === "pass") {
    return "ok";
  }
  if (status === "fail") {
    return "bad";
  }
  if (status === "warn") {
    return "warn";
  }
  return "neutral";
}

function displayValue(prefix, value, t) {
  const key = `${prefix}.${value}`;
  const translated = t(key);
  return translated === key ? value : translated;
}

function displayOptionalValue(prefix, value, t) {
  if (value === undefined || value === null || value === "") {
    return t("status.unknown");
  }
  return displayValue(prefix, value, t);
}

function clientJs(t) {
  return CLIENT_JS
    .replace("__SANCHO_CONFIRM_PREFIX__", safeJsonForHtml(t("action.confirmPrompt")))
    .replace("__OPEN_SETTINGS_FALLBACK__", safeJsonForHtml(t("inputMethod.openSettingsFallback")))
    .replace("__INPUT_METHOD_LABELS__", safeJsonForHtml(inputMethodClientLabels(t)))
    .replace("__INPUT_METHOD_SKIN_PRESETS__", safeJsonForHtml(INPUT_METHOD_SKIN_PRESETS))
    .replace("__INPUT_METHOD_DEFAULT_SKIN__", safeJsonForHtml(INPUT_METHOD_DEFAULT_SKIN));
}

function inputMethodClientLabels(t) {
  return {
    unavailable: t("inputMethod.unavailable"),
    saveWorking: t("inputMethod.saveWorking"),
    saveSuccess: t("inputMethod.saveSuccess"),
    aiWorking: t("inputMethod.aiWorking"),
    aiApplied: t("inputMethod.aiApplied"),
    deepSeekMissing: t("inputMethod.deepSeekMissing"),
    deepSeekAvailableEnv: t("inputMethod.deepSeekAvailableEnv"),
    deepSeekAvailableKeychain: t("inputMethod.deepSeekAvailableKeychain"),
    deepSeekEnvHint: t("inputMethod.deepSeekEnvHint"),
    deepSeekSaved: t("inputMethod.deepSeekSaved"),
    deepSeekDeleted: t("inputMethod.deepSeekDeleted"),
    previewCandidate: t("inputMethod.previewCandidate"),
    previewCandidateOne: t("inputMethod.previewCandidateOne"),
    previewCandidateTwo: t("inputMethod.previewCandidateTwo"),
    previewCandidateThree: t("inputMethod.previewCandidateThree"),
    previewCandidateFour: t("inputMethod.previewCandidateFour"),
    customPhraseSaveWorking: t("quickDictionary.saveWorking"),
    customPhraseSaveSuccess: t("quickDictionary.saveSuccess"),
    customPhraseInvalid: t("quickDictionary.invalidEdit"),
    failed: t("status.fail"),
    unknown: t("status.unknown")
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

const CSS = `
:root {
  color-scheme: light;
  --bg: #f7f8fa;
  --surface: #ffffff;
  --ink: #18202a;
  --muted: #647181;
  --line: #d9e0e7;
  --accent: #1b6f73;
  --accent-soft: #d9f0ed;
  --warn: #9d6711;
  --warn-soft: #fff0d1;
  --bad: #a43838;
  --bad-soft: #f7d7d7;
  --ok: #217044;
  --ok-soft: #dff2e7;
}
* {
  box-sizing: border-box;
}
html {
  height: 100%;
}
body {
  height: 100%;
  margin: 0;
  color: var(--ink);
  background: var(--bg);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.45;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}
.dashboard-chrome {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--surface);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}
.app-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 28px 32px 18px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}
.eyebrow {
  margin: 0 0 4px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}
h1,
h2 {
  margin: 0;
  font-weight: 720;
  letter-spacing: 0;
}
h1 {
  font-size: 26px;
}
h2 {
  font-size: 18px;
}
.header-status,
.summary-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.pill,
.metric,
.badge {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}
.pill,
.metric {
  display: grid;
  gap: 3px;
  min-width: 112px;
  padding: 9px 12px;
}
.pill span,
.metric span {
  color: var(--muted);
  font-size: 12px;
}
.pill strong,
.metric strong {
  font-size: 15px;
}
.tabs {
  display: flex;
  gap: 2px;
  padding: 10px 32px 0;
  overflow-x: auto;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}
.tab {
  appearance: none;
  border: 0;
  border-bottom: 3px solid transparent;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  padding: 12px 14px 10px;
  font: inherit;
  font-weight: 650;
}
.tab.is-active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
main {
  padding: 24px 32px 40px;
}
.dashboard-main {
  min-height: 0;
  overflow: auto;
}
.panel {
  display: none;
}
.panel.is-active {
  display: block;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.summary-grid {
  margin-bottom: 14px;
}
.path-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  color: var(--muted);
}
.dictionary-layout {
  display: grid;
  gap: 18px;
}
.dictionary-editor-panel {
  display: grid;
  gap: 10px;
}
.editor-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.editor-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.dictionary-layout h3 {
  margin: 0 0 10px;
  font-size: 15px;
}
.phrase-preview {
  margin: 0;
  max-width: 520px;
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
  line-height: 1.45;
}
.input-method-form {
  display: grid;
  gap: 16px;
}
.input-method-grid {
  display: grid;
  grid-template-columns: minmax(280px, 0.95fr) minmax(320px, 1.05fr);
  gap: 16px;
  align-items: start;
}
.input-panel {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--line);
  background: var(--surface);
}
.input-panel h3 {
  margin: 0 0 2px;
  font-size: 15px;
}
.predictor-status {
  display: grid;
  gap: 4px;
  color: var(--muted);
}
.predictor-status span {
  font-size: 12px;
  font-weight: 650;
}
.predictor-status strong {
  color: var(--ink);
  font-size: 13px;
  font-weight: 650;
}
.skin-panel {
  grid-column: 1 / -1;
}
.live-preview-panel {
  grid-row: span 2;
}
.field-row,
.credential-field,
.ai-skin-box label {
  display: grid;
  gap: 7px;
  color: var(--muted);
  font-weight: 650;
}
.field-row > span:first-child,
.credential-field > span:first-child,
.ai-skin-box label > span:first-child {
  font-size: 12px;
}
.field-row input[type="number"],
.field-row input[type="text"],
.credential-field input,
.field-row select,
.ai-skin-box textarea {
  width: 100%;
  min-height: 34px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  padding: 7px 10px;
  font: inherit;
}
.ai-skin-box textarea {
  min-height: 82px;
  resize: vertical;
}
.segmented {
  display: inline-grid;
  grid-auto-flow: column;
  justify-content: start;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface);
}
.segmented label {
  min-height: 34px;
  min-width: 92px;
  display: grid;
  place-items: center;
  cursor: pointer;
  border-right: 1px solid var(--line);
  color: var(--muted);
}
.segmented label:last-child {
  border-right: 0;
}
.segmented input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.segmented input:checked + span {
  background: var(--accent);
  color: #ffffff;
}
.segmented label span {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  padding: 7px 12px;
}
.range-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  gap: 10px;
  align-items: center;
}
.range-field input {
  accent-color: var(--accent);
}
.range-field output {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.color-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.color-field {
  display: flex;
  min-height: 38px;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 6px 10px;
  color: var(--muted);
  font-weight: 650;
}
.color-field input {
  width: 38px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
}
.candidate-preview {
  width: min(100%, 330px);
  border: 1px solid var(--preview-border, var(--line));
  border-radius: var(--preview-radius, 8px);
  overflow: hidden;
  background: var(--preview-back, var(--surface));
  color: var(--preview-text, var(--ink));
  box-shadow: 0 12px 30px rgba(0,0,0,0.12);
  font-size: var(--preview-font, 16px);
  line-height: 1.35;
}
.preview-stage {
  display: grid;
  justify-items: start;
  gap: 10px;
}
.composition-line {
  min-width: min(100%, 330px);
  max-width: 100%;
  min-height: 36px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
  color: var(--preview-text, var(--ink));
  padding: 7px 10px;
  font: inherit;
  font-size: var(--preview-font, 16px);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
}
.candidate-preview.linear {
  display: flex;
  flex-wrap: wrap;
}
.candidate-preview.vertical-text {
  width: auto;
  max-width: 100%;
}
.candidate-preview .candidate-row {
  display: grid;
  grid-template-columns: 32px 1fr 58px;
  gap: 6px;
  align-items: center;
  padding: 8px 12px;
}
.candidate-preview.linear .candidate-row {
  grid-template-columns: auto auto;
  min-width: 86px;
  border-right: 1px solid var(--preview-border, var(--line));
}
.candidate-preview.vertical-text .candidate-row {
  align-items: start;
}
.candidate-preview.vertical-text .candidate-value {
  min-height: 5.5em;
  writing-mode: vertical-rl;
  text-orientation: upright;
}
.candidate-preview .candidate-row.active {
  background: var(--preview-hi-back, var(--accent));
  color: var(--preview-hi-text, #ffffff);
}
.candidate-preview .candidate-label {
  color: var(--preview-label, var(--muted));
  font-variant-numeric: tabular-nums;
}
.candidate-preview .candidate-row.active .candidate-label {
  color: var(--preview-hi-label, #ffffff);
}
.candidate-preview .candidate-comment {
  color: var(--preview-comment, var(--muted));
  font-size: 13px;
  text-align: right;
}
.candidate-preview.linear .candidate-comment {
  display: none;
}
.candidate-preview .candidate-row.active .candidate-comment {
  color: var(--preview-hi-comment, #ffffff);
}
.input-method-actions,
.credential-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: 4px;
  color: var(--muted);
}
.ai-skin-box {
  display: grid;
  gap: 10px;
  padding-top: 4px;
}
.form-status,
.credential-status {
  color: var(--muted);
  line-height: 1.4;
}
.form-status.error,
.credential-status.error {
  color: var(--bad);
}
.form-status.ready,
.credential-status.ready {
  color: var(--ok);
  font-weight: 700;
}
.primary-button {
  appearance: none;
  border: 1px solid #125a5e;
  border-radius: 8px;
  background: var(--accent);
  color: #ffffff;
  cursor: pointer;
  padding: 9px 14px;
  font: inherit;
  font-weight: 700;
}
.editor-actions button,
.custom-phrase-table button {
  min-height: 34px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  padding: 7px 12px;
  font: inherit;
  font-weight: 650;
}
.editor-actions button:hover,
.editor-actions button:focus-visible,
.custom-phrase-table button:hover,
.custom-phrase-table button:focus-visible {
  border-color: var(--accent);
  outline: 2px solid var(--accent-soft);
}
.editor-actions .primary-button {
  border-color: #125a5e;
  background: var(--accent);
  color: #ffffff;
}
.custom-phrase-table .icon-button {
  width: 32px;
  padding: 0;
}
.input-panel button {
  min-height: 36px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  padding: 7px 12px;
  font: inherit;
  font-weight: 650;
}
.input-panel button:hover,
.input-panel button:focus-visible {
  border-color: var(--accent);
  outline: 2px solid var(--accent-soft);
}
.input-panel button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.input-panel .primary-button {
  background: var(--accent);
  color: #ffffff;
}
.primary-button:hover,
.primary-button:focus-visible {
  background: #125a5e;
  outline: 2px solid var(--accent-soft);
}
code {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
}
.table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid var(--line);
  background: var(--surface);
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 780px;
}
.editable-table {
  min-width: 680px;
}
.custom-phrase-table th:nth-child(1),
.custom-phrase-table td:nth-child(1) {
  width: 40%;
}
.custom-phrase-table th:nth-child(2),
.custom-phrase-table td:nth-child(2) {
  width: 20%;
}
.custom-phrase-table th:nth-child(3),
.custom-phrase-table td:nth-child(3) {
  width: 14%;
}
.custom-phrase-table th:nth-child(4),
.custom-phrase-table td:nth-child(4) {
  width: 14%;
}
.editable-table input {
  width: 100%;
  min-height: 34px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  padding: 7px 9px;
  font: inherit;
}
.editable-table input:focus {
  border-color: var(--accent);
  outline: 2px solid var(--accent-soft);
}
th,
td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}
th {
  color: var(--muted);
  background: #eef3f6;
  font-size: 12px;
  font-weight: 700;
}
tbody tr:last-child td {
  border-bottom: 0;
}
.numeric,
.button-cell {
  text-align: right;
}
.badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 700;
}
.accent {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: #afd8d4;
}
.ok {
  color: var(--ok);
  background: var(--ok-soft);
  border-color: #b7dcc5;
}
.warn {
  color: var(--warn);
  background: var(--warn-soft);
  border-color: #ebce91;
}
.bad {
  color: var(--bad);
  background: var(--bad-soft);
  border-color: #edb5b5;
}
.neutral {
  color: var(--muted);
  background: #f4f6f8;
}
.icon-button {
  width: 30px;
  height: 30px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  font-weight: 800;
}
.icon-button:hover,
.icon-button:focus-visible {
  border-color: var(--accent);
  outline: 2px solid var(--accent-soft);
}
.action-dialog {
  width: min(520px, calc(100vw - 32px));
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink);
  background: var(--surface);
}
.action-dialog::backdrop {
  background: rgb(24 32 42 / 35%);
}
.action-dialog form {
  display: grid;
  gap: 16px;
}
.action-dialog-details {
  display: grid;
  gap: 10px;
  margin: 0;
}
.action-dialog-details div {
  display: grid;
  gap: 3px;
}
.action-dialog-details dt {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}
.action-dialog-details dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.action-dialog menu {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin: 0;
  padding: 0;
}
.action-dialog button {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  padding: 8px 12px;
}
.action-dialog [value="confirm"] {
  color: var(--warn);
  border-color: #ebce91;
  background: var(--warn-soft);
}
.env-list {
  display: grid;
  gap: 5px;
}
.env-list span {
  white-space: nowrap;
}
.empty {
  margin: 0;
  color: var(--muted);
  padding: 18px;
  border: 1px dashed var(--line);
  background: var(--surface);
}
@media (max-width: 760px) {
  .app-header {
    align-items: flex-start;
    flex-direction: column;
    padding: 20px 18px 14px;
  }
  .tabs {
    padding-left: 18px;
    padding-right: 18px;
  }
  .input-method-grid,
  .color-grid {
    grid-template-columns: 1fr;
  }
  .live-preview-panel,
  .skin-panel {
    grid-column: auto;
    grid-row: auto;
  }
  main {
    padding: 18px;
  }
  h1 {
    font-size: 22px;
  }
}
`;

const CLIENT_JS = `
const inputMethodLabels = __INPUT_METHOD_LABELS__;
const inputMethodSkinPresets = __INPUT_METHOD_SKIN_PRESETS__;
const inputMethodDefaultSkin = __INPUT_METHOD_DEFAULT_SKIN__;
const inputMethodPreviewCandidates = [
  ["Qwen 本地预测", "qwp"],
  ["青蛙趴", "qw"],
  ["请问", "qw"],
  ["期望", "qw"],
  ["前往", "qw"],
  ["轻微", "qw"],
  ["权威", "qw"],
  ["全文", "qw"],
  ["请勿", "qw"]
];

function selectDashboardTab(id) {
  const button = document.querySelector("[data-tab='" + cssEscape(id) + "']");
  if (!button) {
    return;
  }
  document.querySelectorAll("[data-tab]").forEach((tab) => {
    tab.classList.toggle("is-active", tab === button);
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === id);
  });
}

window.sanchoSelectDashboardTab = selectDashboardTab;

const actionDialog = document.getElementById("action-confirm-dialog");
const dialogFields = {
  label: actionDialog?.querySelector("[data-dialog-action-label]"),
  kind: actionDialog?.querySelector("[data-dialog-action-kind]"),
  target: actionDialog?.querySelector("[data-dialog-action-target]")
};
let pendingAction = null;

function actionFromButton(button) {
  return {
    id: button.dataset.actionId || "",
    label: button.dataset.actionLabel || "action",
    kind: button.dataset.actionKind || "",
    risk: button.dataset.actionRisk || "",
    target: button.dataset.actionTarget || ""
  };
}

function dispatchDashboardAction(action) {
  window.dispatchEvent(new CustomEvent("sancho-dashboard-action-confirmed", {
    detail: action
  }));
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    selectDashboardTab(button.dataset.tab);
  });
});
document.querySelectorAll("[data-action-button]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = actionFromButton(button);
    if (button.dataset.requiresConfirmation === "true") {
      pendingAction = action;
      if (dialogFields.label) dialogFields.label.textContent = action.label;
      if (dialogFields.kind) dialogFields.kind.textContent = action.kind;
      if (dialogFields.target) dialogFields.target.textContent = action.target;
      if (actionDialog?.showModal) {
        actionDialog.showModal();
      } else if (actionDialog) {
        actionDialog.setAttribute("open", "");
      }
      return;
    }
    dispatchDashboardAction(action);
  });
});
actionDialog?.querySelector("[data-confirm-action]")?.addEventListener("click", () => {
  if (pendingAction) {
    dispatchDashboardAction({
      ...pendingAction,
      confirmedAt: new Date().toISOString()
    });
    pendingAction = null;
  }
});
actionDialog?.addEventListener("close", () => {
  if (actionDialog.returnValue !== "confirm") {
    pendingAction = null;
  }
});

document.querySelectorAll("[data-open-rime-settings]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (window.sanchoDashboard && typeof window.sanchoDashboard.openRimeSettings === "function") {
      await window.sanchoDashboard.openRimeSettings();
      return;
    }
    window.alert(__OPEN_SETTINGS_FALLBACK__);
  });
});

setupInputMethodForm();
setupCustomPhraseEditor();

function setupCustomPhraseEditor() {
  const body = document.querySelector("[data-custom-phrase-body]");
  if (!body) {
    return;
  }
  const status = document.querySelector("[data-custom-phrase-status]");
  const addButton = document.querySelector("[data-add-custom-phrase]");
  const saveButton = document.querySelector("[data-save-custom-phrases]");

  if (body.querySelectorAll("[data-custom-phrase-row]").length === 0) {
    body.appendChild(createCustomPhraseRow());
  }

  addButton?.addEventListener("click", () => {
    body.appendChild(createCustomPhraseRow());
    body.querySelector("[data-custom-phrase-row]:last-child [data-custom-phrase-field='surface']")?.focus();
  });

  body.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-custom-phrase]");
    if (!button) {
      return;
    }
    button.closest("[data-custom-phrase-row]")?.remove();
  });

  saveButton?.addEventListener("click", async () => {
    if (!window.sanchoDashboard?.saveCustomPhrases) {
      setInlineStatus(status, inputMethodLabels.unavailable, "error");
      return;
    }
    let entries;
    try {
      entries = collectCustomPhraseRows(body);
    } catch (error) {
      setInlineStatus(status, errorMessage(error), "error");
      error.input?.focus();
      return;
    }
    saveButton.disabled = true;
    setInlineStatus(status, inputMethodLabels.customPhraseSaveWorking);
    try {
      const result = await window.sanchoDashboard.saveCustomPhrases(entries);
      setInlineStatus(status, result?.message || inputMethodLabels.customPhraseSaveSuccess, "ready");
    } catch (error) {
      setInlineStatus(status, errorMessage(error), "error");
    } finally {
      saveButton.disabled = false;
    }
  });
}

function createCustomPhraseRow(entry = {}) {
  const row = document.createElement("tr");
  row.dataset.customPhraseRow = "";
  row.innerHTML =
    '<td><input data-custom-phrase-field="surface" type="text" value="' + escapeAttributeClient(entry.surface || "") + '" placeholder="Qwen 本地预测"></td>' +
    '<td><input data-custom-phrase-field="code" type="text" value="' + escapeAttributeClient(entry.code || "") + '" placeholder="qwp"></td>' +
    '<td><input data-custom-phrase-field="weight" type="number" min="0" max="999999" step="1" value="' + escapeAttributeClient(entry.weight ?? 99) + '"></td>' +
    '<td><input data-custom-phrase-field="candidatePosition" type="number" min="1" max="9" step="1" value="' + escapeAttributeClient(entry.candidatePosition ?? "") + '" placeholder="自动"></td>' +
    '<td class="numeric"></td>' +
    '<td class="button-cell"><button class="icon-button" type="button" data-remove-custom-phrase title="删除" aria-label="删除">×</button></td>';
  return row;
}

function collectCustomPhraseRows(body) {
  const entries = [];
  for (const row of body.querySelectorAll("[data-custom-phrase-row]")) {
    const surfaceInput = row.querySelector("[data-custom-phrase-field='surface']");
    const codeInput = row.querySelector("[data-custom-phrase-field='code']");
    const weightInput = row.querySelector("[data-custom-phrase-field='weight']");
    const positionInput = row.querySelector("[data-custom-phrase-field='candidatePosition']");
    const surface = surfaceInput.value.trim();
    const code = codeInput.value.trim();
    const weightText = weightInput.value.trim() || "99";
    const positionText = positionInput?.value.trim() || "";
    if (!surface && !code) {
      continue;
    }
    if (!surface || !code) {
      const error = new Error(inputMethodLabels.customPhraseInvalid);
      error.input = surface ? codeInput : surfaceInput;
      throw error;
    }
    const weight = Number(weightText);
    if (!Number.isInteger(weight) || weight < 0 || weight > 999999) {
      const error = new Error(inputMethodLabels.customPhraseInvalid);
      error.input = weightInput;
      throw error;
    }
    let candidatePosition;
    if (positionText !== "") {
      candidatePosition = Number(positionText);
      if (!Number.isInteger(candidatePosition) || candidatePosition < 1 || candidatePosition > 9) {
        const error = new Error(inputMethodLabels.customPhraseInvalid);
        error.input = positionInput;
        throw error;
      }
    }
    entries.push(candidatePosition === undefined
      ? { surface, code, weight }
      : { surface, code, weight, candidatePosition });
  }
  return entries;
}

function setupInputMethodForm() {
  const form = document.querySelector("[data-input-method-form]");
  if (!form) {
    return;
  }
  const status = form.querySelector("[data-input-method-status]");
  const preview = form.querySelector("[data-candidate-preview]");
  const colorScheme = form.querySelector("[name='colorScheme']");
  const skinName = form.querySelector("[name='customSkinName']");
  const pageSize = form.querySelector("[name='pageSize']");
  const inlinePreedit = form.querySelector("[name='inlinePreedit']");
  const aiPrompt = form.querySelector("[data-ai-skin-prompt]");
  const deepSeekStatus = form.querySelector("[data-deepseek-status]");
  const deepSeekKey = form.querySelector("[data-deepseek-key]");
  const colorInputs = Array.from(form.querySelectorAll("[data-skin-field]"));

  syncRangeOutputs(form);
  updateCandidatePreview(form, preview);
  refreshDeepSeekStatus(form, deepSeekStatus);

  form.querySelectorAll("input, select, textarea").forEach((input) => {
    input.addEventListener("input", () => {
      if (input.dataset.skinField || input === skinName) {
        colorScheme.value = "sancho_custom";
      }
      syncRangeOutputs(form);
      updateCandidatePreview(form, preview);
    });
    input.addEventListener("change", () => {
      if (input === colorScheme) {
        setSkinInputs(form, skinForScheme(colorScheme.value, getSkinInputs(form)));
      }
      syncRangeOutputs(form);
      updateCandidatePreview(form, preview);
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.sanchoDashboard?.saveRimeSettings) {
      setInlineStatus(status, inputMethodLabels.unavailable, "error");
      return;
    }
    const button = form.querySelector("[data-save-rime-settings]");
    button.disabled = true;
    setInlineStatus(status, inputMethodLabels.saveWorking);
    try {
      const result = await window.sanchoDashboard.saveRimeSettings(getInputMethodSettings(form));
      if (result?.settings) {
        applyInputMethodSettings(form, result.settings);
      }
      setInlineStatus(status, inputMethodLabels.saveSuccess, "ready");
    } catch (error) {
      setInlineStatus(status, errorMessage(error), "error");
    } finally {
      button.disabled = false;
    }
  });

  form.querySelector("[data-open-rime-directory]")?.addEventListener("click", async () => {
    if (!window.sanchoDashboard?.openRimeDirectory) {
      setInlineStatus(status, inputMethodLabels.unavailable, "error");
      return;
    }
    try {
      await window.sanchoDashboard.openRimeDirectory();
    } catch (error) {
      setInlineStatus(status, errorMessage(error), "error");
    }
  });

  form.querySelector("[data-generate-rime-skin]")?.addEventListener("click", async (event) => {
    if (!window.sanchoDashboard?.suggestSkin) {
      setInlineStatus(status, inputMethodLabels.unavailable, "error");
      return;
    }
    event.currentTarget.disabled = true;
    setInlineStatus(status, inputMethodLabels.aiWorking);
    try {
      const result = await window.sanchoDashboard.suggestSkin({
        prompt: aiPrompt.value,
        currentSettings: getInputMethodSettings(form)
      });
      colorScheme.value = "sancho_custom";
      setSkinInputs(form, result.skin);
      updateCandidatePreview(form, preview);
      setInlineStatus(status, result.description || inputMethodLabels.aiApplied, "ready");
    } catch (error) {
      setInlineStatus(status, errorMessage(error), "error");
    } finally {
      event.currentTarget.disabled = false;
    }
  });

  form.querySelector("[data-refresh-deepseek]")?.addEventListener("click", () => {
    refreshDeepSeekStatus(form, deepSeekStatus);
  });

  form.querySelector("[data-save-deepseek-key]")?.addEventListener("click", async (event) => {
    if (!window.sanchoDashboard?.saveDeepSeekKey) {
      setInlineStatus(deepSeekStatus, inputMethodLabels.unavailable, "error");
      return;
    }
    event.currentTarget.disabled = true;
    try {
      await window.sanchoDashboard.saveDeepSeekKey(deepSeekKey.value);
      deepSeekKey.value = "";
      await refreshDeepSeekStatus(form, deepSeekStatus);
      setInlineStatus(status, inputMethodLabels.deepSeekSaved, "ready");
    } catch (error) {
      setInlineStatus(deepSeekStatus, errorMessage(error), "error");
    } finally {
      event.currentTarget.disabled = false;
    }
  });

  form.querySelector("[data-delete-deepseek-key]")?.addEventListener("click", async (event) => {
    if (!window.sanchoDashboard?.deleteDeepSeekKey) {
      setInlineStatus(deepSeekStatus, inputMethodLabels.unavailable, "error");
      return;
    }
    event.currentTarget.disabled = true;
    try {
      await window.sanchoDashboard.deleteDeepSeekKey();
      await refreshDeepSeekStatus(form, deepSeekStatus);
      setInlineStatus(status, inputMethodLabels.deepSeekDeleted, "ready");
    } catch (error) {
      setInlineStatus(deepSeekStatus, errorMessage(error), "error");
    } finally {
      event.currentTarget.disabled = false;
    }
  });

  if (pageSize) {
    pageSize.addEventListener("input", () => updateCandidatePreview(form, preview));
  }
  if (inlinePreedit) {
    inlinePreedit.addEventListener("change", () => updateCandidatePreview(form, preview));
  }
  colorInputs.forEach((input) => {
    input.addEventListener("input", () => updateCandidatePreview(form, preview));
  });
}

function getInputMethodSettings(form) {
  return {
    outputScript: selectedRadio(form, "outputScript"),
    candidateLayout: selectedRadio(form, "candidateLayout"),
    textOrientation: selectedRadio(form, "textOrientation"),
    colorScheme: form.querySelector("[name='colorScheme']").value,
    pageSize: Number(form.querySelector("[name='pageSize']").value),
    fontPoint: Number(form.querySelector("[name='fontPoint']").value),
    cornerRadius: Number(form.querySelector("[name='cornerRadius']").value),
    inlinePreedit: form.querySelector("[name='inlinePreedit']").checked,
    predictor: {
      enabled: form.querySelector("[name='predictorEnabled']")?.checked !== false,
      runner: {
        provider: form.querySelector("[name='predictorRunner']")?.value || "none",
        endpoint: form.querySelector("[name='predictorHttpEndpoint']")?.value || undefined,
        ollamaModel: form.querySelector("[name='predictorOllamaModel']")?.value || undefined
      }
    },
    customSkin: getSkinInputs(form)
  };
}

function applyInputMethodSettings(form, settings) {
  setRadio(form, "outputScript", settings.outputScript);
  setRadio(form, "candidateLayout", settings.candidateLayout);
  setRadio(form, "textOrientation", settings.textOrientation);
  form.querySelector("[name='colorScheme']").value = settings.colorScheme;
  form.querySelector("[name='pageSize']").value = settings.pageSize;
  form.querySelector("[name='fontPoint']").value = settings.fontPoint;
  form.querySelector("[name='cornerRadius']").value = settings.cornerRadius;
  form.querySelector("[name='inlinePreedit']").checked = Boolean(settings.inlinePreedit);
  const predictorEnabled = form.querySelector("[name='predictorEnabled']");
  if (predictorEnabled) {
    predictorEnabled.checked = settings.predictor?.enabled !== false;
  }
  const predictorRunner = form.querySelector("[name='predictorRunner']");
  if (predictorRunner) {
    predictorRunner.value = settings.predictor?.runner?.provider || "none";
  }
  const predictorHttpEndpoint = form.querySelector("[name='predictorHttpEndpoint']");
  if (predictorHttpEndpoint) {
    predictorHttpEndpoint.value = settings.predictor?.runner?.endpoint || "";
  }
  const predictorOllamaModel = form.querySelector("[name='predictorOllamaModel']");
  if (predictorOllamaModel) {
    predictorOllamaModel.value = settings.predictor?.runner?.model || settings.predictor?.runner?.ollamaModel || "";
  }
  setSkinInputs(form, settings.customSkin || inputMethodDefaultSkin);
}

function selectedRadio(form, name) {
  return form.querySelector("input[name='" + name + "']:checked")?.value;
}

function setRadio(form, name, value) {
  const input = form.querySelector("input[name='" + name + "'][value='" + value + "']");
  if (input) {
    input.checked = true;
  }
}

function getSkinInputs(form) {
  const skin = {
    ...inputMethodDefaultSkin,
    name: form.querySelector("[name='customSkinName']").value || inputMethodDefaultSkin.name
  };
  form.querySelectorAll("[data-skin-field]").forEach((input) => {
    skin[input.dataset.skinField] = input.value.toUpperCase();
  });
  return skin;
}

function setSkinInputs(form, skin) {
  const nextSkin = { ...inputMethodDefaultSkin, ...(skin || {}) };
  form.querySelector("[name='customSkinName']").value = nextSkin.name;
  form.querySelectorAll("[data-skin-field]").forEach((input) => {
    input.value = nextSkin[input.dataset.skinField] || inputMethodDefaultSkin[input.dataset.skinField];
  });
}

function skinForScheme(scheme, customSkin) {
  if (scheme === "sancho_custom") {
    return customSkin || inputMethodDefaultSkin;
  }
  return inputMethodSkinPresets[scheme] || customSkin || inputMethodDefaultSkin;
}

function updateCandidatePreview(form, preview) {
  if (!preview) {
    return;
  }
  const settings = getInputMethodSettings(form);
  const previewCodeInput = form.querySelector("[data-preview-code]");
  const previewCode = (previewCodeInput?.value || "qwp").trim() || "qwp";
  const composition = form.querySelector("[data-preview-composition]");
  const skin = settings.colorScheme === "sancho_custom"
    ? settings.customSkin
    : skinForScheme(settings.colorScheme, settings.customSkin);
  preview.style.setProperty("--preview-back", skin.backColor);
  preview.style.setProperty("--preview-border", skin.borderColor);
  preview.style.setProperty("--preview-text", skin.candidateTextColor);
  preview.style.setProperty("--preview-comment", skin.commentTextColor);
  preview.style.setProperty("--preview-label", skin.labelColor);
  preview.style.setProperty("--preview-hi-back", skin.highlightedBackColor);
  preview.style.setProperty("--preview-hi-text", skin.highlightedTextColor);
  preview.style.setProperty("--preview-hi-label", skin.highlightedLabelColor);
  preview.style.setProperty("--preview-hi-comment", skin.highlightedCommentColor);
  preview.style.setProperty("--preview-font", settings.fontPoint + "px");
  preview.style.setProperty("--preview-radius", settings.cornerRadius + "px");
  preview.classList.toggle("linear", settings.candidateLayout === "linear");
  preview.classList.toggle("vertical-text", settings.textOrientation === "vertical");
  if (composition) {
    composition.textContent = settings.inlinePreedit ? previewCode : "";
    composition.hidden = !settings.inlinePreedit;
    composition.style.setProperty("--preview-font", settings.fontPoint + "px");
    composition.style.setProperty("--preview-text", skin.textColor || skin.candidateTextColor);
  }
  preview.innerHTML = previewCandidatesForCode(previewCode)
    .slice(0, Math.max(3, Math.min(9, settings.pageSize || 5)))
    .map(([candidate, comment], index) => {
      const active = index === 0 ? " active" : "";
      return '<div class="candidate-row' + active + '"><span class="candidate-label">' +
        (index + 1) + '.</span><span class="candidate-value">' + escapeHtmlClient(candidate) +
        '</span><span class="candidate-comment">' + escapeHtmlClient(comment) + '</span></div>';
    })
    .join("");
}

function previewCandidatesForCode(code) {
  const normalizedCode = String(code || "").toLowerCase();
  const matches = inputMethodPreviewCandidates.filter(([, candidateCode]) =>
    candidateCode.startsWith(normalizedCode) || normalizedCode.startsWith(candidateCode)
  );
  if (matches.length > 0) {
    return matches;
  }
  return [
    [inputMethodLabels.previewCandidate, normalizedCode],
    [inputMethodLabels.previewCandidateOne, normalizedCode],
    [inputMethodLabels.previewCandidateTwo, normalizedCode],
    [inputMethodLabels.previewCandidateThree, normalizedCode],
    [inputMethodLabels.previewCandidateFour, normalizedCode]
  ];
}

function syncRangeOutputs(form) {
  form.querySelectorAll("[data-range-output]").forEach((output) => {
    const input = form.querySelector("[name='" + output.dataset.rangeOutput + "']");
    output.textContent = input?.value || "";
  });
}

async function refreshDeepSeekStatus(form, target) {
  if (!target) {
    return null;
  }
  if (!window.sanchoDashboard?.deepSeekStatus) {
    setInlineStatus(target, inputMethodLabels.deepSeekMissing);
    return null;
  }
  try {
    const status = await window.sanchoDashboard.deepSeekStatus();
    const credential = status?.credential;
    if (!credential?.available) {
      setInlineStatus(target, inputMethodLabels.deepSeekMissing);
      return status;
    }
    if (credential.source === "env") {
      setInlineStatus(
        target,
        inputMethodLabels.deepSeekAvailableEnv.replace("{source}", credential.envName || status.envName)
          + " " + inputMethodLabels.deepSeekEnvHint,
        "ready"
      );
      return status;
    }
    setInlineStatus(
      target,
      inputMethodLabels.deepSeekAvailableKeychain.replace("{source}", credential.service || status.keychainService),
      "ready"
    );
    return status;
  } catch (error) {
    setInlineStatus(target, errorMessage(error), "error");
    return null;
  }
}

function setInlineStatus(element, text, tone) {
  if (!element) {
    return;
  }
  element.textContent = text || "";
  element.classList.toggle("error", tone === "error");
  element.classList.toggle("ready", tone === "ready");
}

function errorMessage(error) {
  return (error && error.message) || inputMethodLabels.failed;
}

function escapeHtmlClient(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttributeClient(value) {
  return escapeHtmlClient(value).replaceAll("'", "&#39;").replaceAll(String.fromCharCode(96), "&#96;");
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }
  return String(value).replaceAll("'", "\\\\'");
}
`;
