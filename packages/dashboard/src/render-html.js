import { createDashboardViewModel } from "./view-model.js";

export function renderDashboardHtml(input = {}, options = {}) {
  const model = input.schemaVersion === 1 && input.navigation
    ? input
    : createDashboardViewModel(input);
  const lang = options.lang ?? "en";

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
  <header class="app-header">
    <div>
      <p class="eyebrow">SanchoAiIME</p>
      <h1>${escapeHtml(model.title)}</h1>
    </div>
    <div class="header-status">
      ${statPill("Dictionary", model.summary.quickDictionaryEntries)}
      ${statPill("Actions", model.summary.actions)}
      ${statusPill("Release", model.summary.releaseStatus)}
    </div>
  </header>
  <nav class="tabs" aria-label="Dashboard sections">
    ${model.navigation.map((item, index) => `
      <button class="tab${index === 0 ? " is-active" : ""}" type="button" data-tab="${escapeAttribute(item.id)}" aria-controls="${escapeAttribute(item.id)}">${escapeHtml(item.label)}</button>
    `).join("")}
  </nav>
  <main>
    ${section("quick-dictionary", "Dictionary", renderQuickDictionary(model.quickDictionary), true)}
    ${section("actions", "Actions", renderActions(model.actions))}
    ${section("profiles", "Profiles", renderProfiles(model.profiles))}
    ${section("models", "Models", renderModels(model.models))}
    ${section("imports", "Imports", renderImports(model.imports))}
    ${section("maintenance", "Maintenance", renderMaintenance(model.maintenanceJobs))}
    ${section("release", "Release", renderRelease(model.releaseChecks))}
  </main>
  <script>${CLIENT_JS}</script>
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

function renderQuickDictionary(dictionary) {
  const rows = dictionary.entries.map((entry) => `
    <tr>
      <td>${escapeHtml(entry.surface)}</td>
      <td><code>${escapeHtml(entry.code)}</code></td>
      <td class="numeric">${entry.weight}</td>
    </tr>
  `).join("");

  return `
    <div class="summary-grid">
      ${metric("Managed Entries", dictionary.summary.entryCount)}
      ${metric("Average Weight", dictionary.summary.averageWeight)}
      ${metric("Region", dictionary.managedRegionStatus)}
    </div>
    <p class="path-line"><span>Path</span><code>${escapeHtml(dictionary.path)}</code></p>
    ${table(["Surface", "Code", "Weight"], rows, "No managed quick dictionary entries.")}
  `;
}

function renderActions(actions) {
  const rows = actions.map((action) => `
    <tr>
      <td>${escapeHtml(action.label)}</td>
      <td><code>${escapeHtml(action.code)}</code></td>
      <td>${badge(action.category, action.category === "snippet" ? "neutral" : "accent")}</td>
      <td>${escapeHtml(action.kind)}</td>
      <td>${badge(action.risk, action.requiresConfirmation ? "warn" : "ok")}</td>
      <td>${escapeHtml(actionTargetText(action))}</td>
      <td class="button-cell">
        <button class="icon-button" type="button" title="${action.requiresConfirmation ? "Confirm action" : "Preview action"}" aria-label="${action.requiresConfirmation ? "Confirm action" : "Preview action"}" data-action-button data-action-label="${escapeAttribute(action.label)}" data-requires-confirmation="${action.requiresConfirmation ? "true" : "false"}">
          ${action.requiresConfirmation ? "!" : ">"}
        </button>
      </td>
    </tr>
  `).join("");

  return table(["Label", "Code", "Type", "Kind", "Risk", "Target", ""], rows, "No actions registered.");
}

function renderProfiles(profiles) {
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

  return table(["Label", "Command", "Args", "CWD", "Inherit", "Env"], rows, "No profiles configured.");
}

function renderModels(models) {
  const rows = models.map((model) => `
    <tr>
      <td>${escapeHtml(model.name)}</td>
      <td><code>${escapeHtml(model.id)}</code></td>
      <td>${escapeHtml(model.role ?? "")}</td>
      <td>${badge(model.status, model.status === "ready" ? "ok" : "neutral")}</td>
      <td>${escapeHtml(model.source.repository ?? model.source.url ?? "")}</td>
      <td>${escapeHtml(model.source.license ?? "")}</td>
      <td class="numeric">${model.artifactCount}</td>
      <td>${benchmarkText(model.benchmark)}</td>
    </tr>
  `).join("");

  return table(["Name", "ID", "Role", "Status", "Source", "License", "Artifacts", "Benchmark"], rows, "No model manifests available.");
}

function renderImports(imports) {
  const rows = imports.map((item) => `
    <tr>
      <td>${escapeHtml(item.source)}</td>
      <td>${escapeHtml(item.format)}</td>
      <td class="numeric">${item.summary.importedEntries}</td>
      <td class="numeric">${item.summary.duplicateRows}</td>
      <td class="numeric">${item.summary.rejectedRows}</td>
      <td>${item.privateEntriesOmitted ? badge("entries omitted", "warn") : badge("summary only", "ok")}</td>
    </tr>
  `).join("");

  return table(["Source", "Format", "Imported", "Duplicates", "Rejected", "Privacy"], rows, "No import previews loaded.");
}

function renderMaintenance(jobs) {
  const rows = jobs.map((job) => `
    <tr>
      <td><code>${escapeHtml(job.id)}</code></td>
      <td>${escapeHtml(job.kind)}</td>
      <td>${escapeHtml(job.model ?? "")}</td>
      <td>${badge(job.status, job.status === "ready" ? "ok" : "neutral")}</td>
      <td>${escapeHtml(job.privacyMode)}</td>
      <td class="numeric">${job.budgetCents ?? ""}</td>
      <td class="numeric">${job.scopeCount}</td>
      <td>${escapeHtml(job.diffStatus ?? "")}</td>
    </tr>
  `).join("");

  return table(["ID", "Kind", "Model", "Status", "Privacy", "Budget", "Scope", "Diff"], rows, "No maintenance jobs queued.");
}

function renderRelease(checks) {
  const rows = checks.map((check) => `
    <tr>
      <td>${escapeHtml(check.label)}</td>
      <td>${badge(check.status, statusTone(check.status))}</td>
      <td>${escapeHtml(check.detail ?? "")}</td>
      <td><code>${escapeHtml(check.command ?? "")}</code></td>
    </tr>
  `).join("");

  return table(["Check", "Status", "Detail", "Command"], rows, "No release checks available.");
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

function benchmarkText(benchmark) {
  const parts = [];
  if (benchmark.iterations !== undefined) {
    parts.push(`${benchmark.iterations} runs`);
  }
  if (benchmark.medianMs !== undefined) {
    parts.push(`${benchmark.medianMs} ms`);
  }
  if (benchmark.timeoutMs !== undefined) {
    parts.push(`${benchmark.timeoutMs} ms timeout`);
  }
  return escapeHtml(parts.join(" / "));
}

function statPill(label, value) {
  return `<span class="pill"><span>${escapeHtml(label)}</span><strong>${value}</strong></span>`;
}

function statusPill(label, status) {
  return `<span class="pill ${statusTone(status)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(status)}</strong></span>`;
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
body {
  margin: 0;
  color: var(--ink);
  background: var(--bg);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.45;
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
  main {
    padding: 18px;
  }
  h1 {
    font-size: 22px;
  }
}
`;

const CLIENT_JS = `
document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const id = button.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((tab) => {
      tab.classList.toggle("is-active", tab === button);
    });
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.panel === id);
    });
  });
});
document.querySelectorAll("[data-action-button]").forEach((button) => {
  button.addEventListener("click", () => {
    const label = button.dataset.actionLabel || "action";
    if (button.dataset.requiresConfirmation === "true") {
      window.confirm("Confirm Sancho action: " + label);
    }
  });
});
`;
