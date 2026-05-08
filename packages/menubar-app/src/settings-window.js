import {
  DEFAULT_CUSTOM_SKIN,
  SANCHO_SKIN_PRESETS
} from "./rime-settings.js";

const COLOR_FIELDS = [
  ["backColor", "rimeSkinBackColor"],
  ["borderColor", "rimeSkinBorderColor"],
  ["textColor", "rimeSkinTextColor"],
  ["candidateTextColor", "rimeSkinCandidateTextColor"],
  ["commentTextColor", "rimeSkinCommentTextColor"],
  ["labelColor", "rimeSkinLabelColor"],
  ["highlightedBackColor", "rimeSkinHighlightedBackColor"],
  ["highlightedTextColor", "rimeSkinHighlightedTextColor"],
  ["highlightedLabelColor", "rimeSkinHighlightedLabelColor"],
  ["highlightedCommentColor", "rimeSkinHighlightedCommentColor"]
];

export function renderRimeSettingsHtml(translator) {
  const t = translator.t;
  const labels = {
    title: t("rimeSettingsTitle"),
    subtitle: t("rimeSettingsSubtitle"),
    predictionTitle: t("predictionStatusTitle"),
    predictionMode: t("predictionStatusMode"),
    predictionDetail: t("predictionStatusDetail"),
    outputTitle: t("rimeSettingsOutputTitle"),
    outputScript: t("rimeSettingsOutputScript"),
    simplified: t("rimeSettingsSimplified"),
    traditional: t("rimeSettingsTraditional"),
    appearanceTitle: t("rimeSettingsAppearanceTitle"),
    colorScheme: t("rimeSettingsColorScheme"),
    candidateLayout: t("rimeSettingsCandidateLayout"),
    stacked: t("rimeSettingsStacked"),
    linear: t("rimeSettingsLinear"),
    textOrientation: t("rimeSettingsTextOrientation"),
    horizontal: t("rimeSettingsHorizontal"),
    vertical: t("rimeSettingsVertical"),
    inlinePreedit: t("rimeSettingsInlinePreedit"),
    englishPunctuation: t("rimeSettingsEnglishPunctuation"),
    mixedInput: t("rimeSettingsMixedInput"),
    flashPredictor: t("rimeSettingsFlashPredictor"),
    behaviorTitle: t("rimeSettingsBehaviorTitle"),
    aiTitle: t("rimeSettingsAiTitle"),
    pageSize: t("rimeSettingsPageSize"),
    fontPoint: t("rimeSettingsFontPoint"),
    cornerRadius: t("rimeSettingsCornerRadius"),
    skinTitle: t("rimeSkinTitle"),
    skinPreview: t("rimeSkinPreview"),
    customSkinName: t("rimeSkinCustomName"),
    aiSkinTitle: t("rimeSkinAiTitle"),
    aiSkinPrompt: t("rimeSkinAiPrompt"),
    aiSkinGenerate: t("rimeSkinAiGenerate"),
    aiSkinPlaceholder: t("rimeSkinAiPlaceholder"),
    aiSkinWorking: t("rimeSkinAiWorking"),
    aiSkinApplied: t("rimeSkinAiApplied"),
    builtInSkinPreview: t("rimeSkinBuiltInPreview"),
    deepSeekTitle: t("deepSeekCredentialTitle"),
    deepSeekStatus: t("deepSeekCredentialStatus"),
    deepSeekAvailableEnv: t("deepSeekCredentialAvailableEnv"),
    deepSeekAvailableKeychain: t("deepSeekCredentialAvailableKeychain"),
    deepSeekMissing: t("deepSeekCredentialMissing"),
    deepSeekKeyLabel: t("deepSeekCredentialKeyLabel"),
    deepSeekPlaceholder: t("deepSeekCredentialPlaceholder"),
    deepSeekSave: t("deepSeekCredentialSave"),
    deepSeekDelete: t("deepSeekCredentialDelete"),
    deepSeekCheck: t("deepSeekCredentialCheck"),
    deepSeekSaved: t("deepSeekCredentialSaved"),
    deepSeekDeleted: t("deepSeekCredentialDeleted"),
    deepSeekEnvHint: t("deepSeekCredentialEnvHint"),
    save: t("rimeSettingsSave"),
    openDirectory: t("rimeSettingsOpenDirectory"),
    loading: t("rimeSettingsLoading"),
    saved: t("rimeSettingsSaved"),
    failed: t("rimeSettingsFailed")
  };
  for (const [, key] of COLOR_FIELDS) {
    labels[key] = t(key);
  }

  const payload = JSON.stringify(labels);
  const skinPayload = JSON.stringify(SANCHO_SKIN_PRESETS);
  const customSkinPayload = JSON.stringify(DEFAULT_CUSTOM_SKIN);
  const colorOptions = renderColorSchemeOptions();
  const colorFields = COLOR_FIELDS.map(([field, key]) => `
        <label class="color-field">
          <span>${escapeHtml(labels[key])}</span>
          <input type="color" data-skin-field="${escapeHtml(field)}">
        </label>`).join("");

  return `<!doctype html>
<html lang="${escapeHtml(translator.locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(labels.title)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #17202a;
      --muted: #607080;
      --line: #d9dee5;
      --accent: #16745f;
      --accent-strong: #0f5d4c;
      --danger: #b3261e;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #111418;
        --panel: #181d23;
        --text: #eef2f6;
        --muted: #a9b4c0;
        --line: #303843;
        --accent: #49b896;
        --accent-strong: #68d5b2;
        --danger: #ffb4ab;
      }
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif;
      font-size: 14px;
      letter-spacing: 0;
    }

    main {
      display: grid;
      grid-template-columns: 240px minmax(0, 1fr);
      min-height: 100vh;
    }

    aside {
      padding: 26px 22px;
      background: #18202a;
      color: #eef4f6;
      border-right: 1px solid rgba(255,255,255,0.08);
    }

    aside h1 {
      margin: 0 0 8px;
      font-size: 22px;
      font-weight: 700;
      line-height: 1.2;
    }

    aside p,
    .prediction span {
      margin: 0;
      color: #b9c7d2;
      line-height: 1.5;
    }

    .prediction {
      margin-top: 26px;
      padding-top: 20px;
      border-top: 1px solid rgba(255,255,255,0.12);
    }

    .prediction strong {
      display: block;
      margin-bottom: 8px;
      font-size: 13px;
    }

    .prediction span {
      display: block;
      color: #cdd7df;
    }

    form {
      display: block;
      width: 100%;
      max-width: 880px;
      padding: 26px 32px 64px;
    }

    section {
      padding: 8px 0 22px;
      border-bottom: 1px solid var(--line);
    }

    section:last-of-type {
      border-bottom: 0;
    }

    section h2 {
      margin: 0 0 14px;
      font-size: 15px;
      font-weight: 700;
    }

    .row {
      display: grid;
      grid-template-columns: 180px minmax(0, 1fr);
      align-items: center;
      gap: 16px;
      min-height: 46px;
    }

    .row > label:first-child {
      color: var(--muted);
      font-weight: 500;
    }

    select,
    textarea,
    input[type="number"],
    input[type="password"],
    input[type="text"] {
      width: 100%;
      max-width: 300px;
      min-height: 34px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--panel);
      color: var(--text);
      padding: 6px 10px;
      font: inherit;
    }

    textarea {
      max-width: 100%;
      min-height: 78px;
      resize: vertical;
      line-height: 1.45;
    }

    input[type="range"] {
      width: min(260px, 100%);
      accent-color: var(--accent);
    }

    input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: var(--accent);
    }

    input[type="color"] {
      width: 36px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: transparent;
    }

    .segmented {
      display: inline-grid;
      grid-auto-flow: column;
      border: 1px solid var(--line);
      border-radius: 7px;
      overflow: hidden;
      background: var(--panel);
    }

    .segmented label {
      min-width: 96px;
      min-height: 34px;
      display: grid;
      place-items: center;
      padding: 6px 12px;
      cursor: pointer;
      color: var(--muted);
      border-right: 1px solid var(--line);
    }

    .segmented label:last-child {
      border-right: 0;
    }

    .segmented input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }

    .segmented label:has(input:checked) {
      color: #ffffff;
      background: var(--accent);
    }

    .inline-value {
      display: inline-grid;
      grid-template-columns: minmax(0, 260px) 44px;
      align-items: center;
      gap: 10px;
    }

    .inline-value output {
      color: var(--muted);
      font-variant-numeric: tabular-nums;
    }

    .skin-grid {
      display: grid;
      grid-template-columns: minmax(250px, 320px) minmax(280px, 1fr);
      gap: 18px;
      align-items: start;
    }

    .preview-wrap {
      display: grid;
      gap: 10px;
    }

    .preview-label {
      color: var(--muted);
      font-size: 13px;
      font-weight: 500;
    }

    .candidate-preview {
      width: min(100%, 310px);
      border: 1px solid var(--preview-border);
      border-radius: 8px;
      overflow: hidden;
      background: var(--preview-back);
      color: var(--preview-text);
      box-shadow: 0 12px 30px rgba(0,0,0,0.14);
      font-size: 18px;
      line-height: 1.35;
    }

    .candidate-preview.linear {
      display: flex;
      flex-wrap: wrap;
      gap: 0;
    }

    .candidate-preview .row-line {
      display: grid;
      grid-template-columns: 32px 1fr 58px;
      gap: 6px;
      align-items: center;
      padding: 8px 12px;
    }

    .candidate-preview.linear .row-line {
      grid-template-columns: auto auto;
      width: auto;
      min-width: 86px;
      border-right: 1px solid var(--preview-border);
    }

    .candidate-preview.linear .comment {
      display: none;
    }

    .candidate-preview .active {
      background: var(--preview-hi-back);
      color: var(--preview-hi-text);
    }

    .candidate-preview .label {
      color: var(--preview-label);
      font-variant-numeric: tabular-nums;
    }

    .candidate-preview .active .label {
      color: var(--preview-hi-label);
    }

    .candidate-preview .comment {
      color: var(--preview-comment);
      font-size: 13px;
      text-align: right;
    }

    .candidate-preview .active .comment {
      color: var(--preview-hi-comment);
    }

    .color-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .built-in-preview {
      display: grid;
      place-items: center;
      min-height: 140px;
      background: var(--panel);
      border: 1px dashed var(--line);
      border-radius: 8px;
    }

    .preview-builtin-msg {
      color: var(--muted);
      font-size: 14px;
      font-weight: 500;
    }

    input:disabled,
    input[type="color"]:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .skin-ai {
      display: grid;
      gap: 10px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
    }

    .skin-ai h3 {
      margin: 0;
      font-size: 14px;
    }

    .skin-ai label,
    .credential-field {
      display: grid;
      gap: 7px;
      color: var(--muted);
      font-weight: 500;
    }

    .credential-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin-top: 10px;
    }

    .credential-status {
      min-height: 20px;
      color: var(--muted);
      line-height: 1.45;
    }

    .credential-status.ready {
      color: var(--accent);
      font-weight: 600;
    }

    .credential-status.error {
      color: var(--danger);
    }

    .color-field {
      display: flex;
      min-height: 36px;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 6px 10px;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: var(--panel);
      color: var(--muted);
    }

    .actions {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 14px 32px;
      background: var(--panel);
      border-top: 1px solid var(--line);
      position: sticky;
      bottom: 0;
      z-index: 10;
      box-shadow: 0 -4px 16px rgba(0,0,0,0.06);
      margin: 0 -32px;
    }

    button {
      min-height: 36px;
      border: 1px solid var(--line);
      border-radius: 7px;
      padding: 7px 14px;
      background: var(--panel);
      color: var(--text);
      font: inherit;
      cursor: pointer;
    }

    button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: #ffffff;
      font-weight: 600;
    }

    button.primary:hover {
      background: var(--accent-strong);
    }

    .status {
      min-height: 20px;
      color: var(--muted);
      line-height: 1.45;
    }

    .status.error {
      color: var(--danger);
    }

    @media (max-width: 820px) {
      main,
      .skin-grid {
        grid-template-columns: 1fr;
      }

      aside {
        border-right: 0;
      }

      form {
        padding: 24px;
      }

      .row {
        grid-template-columns: 1fr;
        gap: 8px;
        padding: 8px 0;
      }
    }
  </style>
</head>
<body>
  <main>
    <aside>
      <h1>${escapeHtml(labels.title)}</h1>
      <p>${escapeHtml(labels.subtitle)}</p>
      <div class="prediction">
        <strong>${escapeHtml(labels.predictionTitle)}</strong>
        <span>${escapeHtml(labels.predictionMode)}</span>
        <span>${escapeHtml(labels.predictionDetail)}</span>
      </div>
    </aside>
    <form id="settings-form">
      <section>
        <h2>${escapeHtml(labels.outputTitle)}</h2>
        <div class="row">
          <label>${escapeHtml(labels.outputScript)}</label>
          <div class="segmented">
            <label><input type="radio" name="outputScript" value="simplified">${escapeHtml(labels.simplified)}</label>
            <label><input type="radio" name="outputScript" value="traditional">${escapeHtml(labels.traditional)}</label>
          </div>
        </div>
      </section>

      <section>
        <h2>${escapeHtml(labels.skinTitle)}</h2>
        <div class="skin-grid">
          <div class="preview-wrap">
            <span class="preview-label">${escapeHtml(labels.skinPreview)}</span>
            <div class="candidate-preview" id="skinPreview">
            </div>
          </div>
          <div>
            <div class="row">
              <label for="colorScheme">${escapeHtml(labels.colorScheme)}</label>
              <select id="colorScheme" name="colorScheme">${colorOptions}</select>
            </div>
            <div class="row">
              <label for="customSkinName">${escapeHtml(labels.customSkinName)}</label>
              <input id="customSkinName" type="text" maxlength="40">
            </div>
            <div class="color-grid">${colorFields}
            </div>
            <div class="skin-ai">
              <h3>${escapeHtml(labels.aiSkinTitle)}</h3>
              <label>
                <span>${escapeHtml(labels.aiSkinPrompt)}</span>
                <textarea id="aiSkinPrompt" placeholder="${escapeHtml(labels.aiSkinPlaceholder)}"></textarea>
              </label>
              <button type="button" id="generateSkin">${escapeHtml(labels.aiSkinGenerate)}</button>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2>${escapeHtml(labels.deepSeekTitle)}</h2>
        <div class="row">
          <label>${escapeHtml(labels.deepSeekStatus)}</label>
          <span class="credential-status" id="deepSeekStatus">${escapeHtml(labels.loading)}</span>
        </div>
        <label class="credential-field" for="deepSeekApiKey">
          <span>${escapeHtml(labels.deepSeekKeyLabel)}</span>
          <input id="deepSeekApiKey" type="password" autocomplete="off" placeholder="${escapeHtml(labels.deepSeekPlaceholder)}">
        </label>
        <div class="credential-actions">
          <button type="button" id="saveDeepSeekKey">${escapeHtml(labels.deepSeekSave)}</button>
          <button type="button" id="deleteDeepSeekKey">${escapeHtml(labels.deepSeekDelete)}</button>
          <button type="button" id="refreshDeepSeekStatus">${escapeHtml(labels.deepSeekCheck)}</button>
        </div>
      </section>

      <section>
        <h2>${escapeHtml(labels.appearanceTitle)}</h2>
        <div class="row">
          <label>${escapeHtml(labels.candidateLayout)}</label>
          <div class="segmented">
            <label><input type="radio" name="candidateLayout" value="stacked">${escapeHtml(labels.stacked)}</label>
            <label><input type="radio" name="candidateLayout" value="linear">${escapeHtml(labels.linear)}</label>
          </div>
        </div>
        <div class="row">
          <label>${escapeHtml(labels.textOrientation)}</label>
          <div class="segmented">
            <label><input type="radio" name="textOrientation" value="horizontal">${escapeHtml(labels.horizontal)}</label>
            <label><input type="radio" name="textOrientation" value="vertical">${escapeHtml(labels.vertical)}</label>
          </div>
        </div>
        <div class="row">
          <label for="fontPoint">${escapeHtml(labels.fontPoint)}</label>
          <span class="inline-value">
            <input id="fontPoint" name="fontPoint" type="range" min="12" max="24" step="1">
            <output id="fontPointValue"></output>
          </span>
        </div>
        <div class="row">
          <label for="cornerRadius">${escapeHtml(labels.cornerRadius)}</label>
          <span class="inline-value">
            <input id="cornerRadius" name="cornerRadius" type="range" min="0" max="16" step="1">
            <output id="cornerRadiusValue"></output>
          </span>
        </div>
      </section>

      <section>
        <h2>${escapeHtml(labels.behaviorTitle)}</h2>
        <div class="row">
          <label for="pageSize">${escapeHtml(labels.pageSize)}</label>
          <input id="pageSize" name="pageSize" type="number" min="3" max="9" step="1">
        </div>
        <div class="row">
          <label for="mixedInput">${escapeHtml(labels.mixedInput)}</label>
          <input id="mixedInput" name="mixedInput" type="checkbox" checked>
        </div>
        <div class="row">
          <label for="englishPunctuation">${escapeHtml(labels.englishPunctuation)}</label>
          <input id="englishPunctuation" name="englishPunctuation" type="checkbox">
        </div>
        <div class="row">
          <label for="inlinePreedit">${escapeHtml(labels.inlinePreedit)}</label>
          <input id="inlinePreedit" name="inlinePreedit" type="checkbox">
        </div>
      </section>

      <section>
        <h2>${escapeHtml(labels.aiTitle)}</h2>
        <div class="row">
          <label for="flashPredictor">${escapeHtml(labels.flashPredictor)}</label>
          <input id="flashPredictor" name="flashPredictor" type="checkbox">
        </div>
      </section>

      <div class="actions">
        <button class="primary" type="submit">${escapeHtml(labels.save)}</button>
        <button type="button" id="openDirectory">${escapeHtml(labels.openDirectory)}</button>
        <span class="status" id="status">${escapeHtml(labels.loading)}</span>
      </div>
    </form>
  </main>
  <script>
    const labels = ${payload};
    const skinPresets = ${skinPayload};
    const defaultCustomSkin = ${customSkinPayload};
    const form = document.getElementById("settings-form");
    const statusEl = document.getElementById("status");
    const colorScheme = document.getElementById("colorScheme");
    const customSkinName = document.getElementById("customSkinName");
    const pageSize = document.getElementById("pageSize");
    const inlinePreedit = document.getElementById("inlinePreedit");
    const englishPunctuation = document.getElementById("englishPunctuation");
    const mixedInput = document.getElementById("mixedInput");
    const flashPredictor = document.getElementById("flashPredictor");
    const fontPoint = document.getElementById("fontPoint");
    const fontPointValue = document.getElementById("fontPointValue");
    const cornerRadius = document.getElementById("cornerRadius");
    const cornerRadiusValue = document.getElementById("cornerRadiusValue");
    const skinPreview = document.getElementById("skinPreview");
    const colorInputs = Array.from(document.querySelectorAll("[data-skin-field]"));
    const aiSkinPrompt = document.getElementById("aiSkinPrompt");
    const generateSkin = document.getElementById("generateSkin");
    const deepSeekStatus = document.getElementById("deepSeekStatus");
    const deepSeekApiKey = document.getElementById("deepSeekApiKey");
    const saveDeepSeekKey = document.getElementById("saveDeepSeekKey");
    const deleteDeepSeekKey = document.getElementById("deleteDeepSeekKey");
    const refreshDeepSeekStatus = document.getElementById("refreshDeepSeekStatus");
    const previewCandidates = [
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

    function setStatus(text, isError = false) {
      statusEl.textContent = text;
      statusEl.classList.toggle("error", isError);
    }

    function setDeepSeekStatus(text, options = {}) {
      deepSeekStatus.textContent = text;
      deepSeekStatus.classList.toggle("ready", Boolean(options.ready));
      deepSeekStatus.classList.toggle("error", Boolean(options.error));
    }

    function formatCredentialStatus(status) {
      const credential = status && status.credential;
      if (!credential || !credential.available) {
        return {
          text: labels.deepSeekMissing,
          ready: false
        };
      }
      if (credential.source === "env") {
        return {
          text: labels.deepSeekAvailableEnv.replace("{source}", credential.envName || status.envName),
          ready: true,
          hint: labels.deepSeekEnvHint
        };
      }
      return {
        text: labels.deepSeekAvailableKeychain.replace("{source}", credential.service || status.keychainService),
        ready: true
      };
    }

    async function refreshDeepSeekCredentialStatus() {
      try {
        const status = await window.sanchoRimeSettings.deepSeekStatus();
        const formatted = formatCredentialStatus(status);
        setDeepSeekStatus(
          formatted.hint ? formatted.text + " " + formatted.hint : formatted.text,
          { ready: formatted.ready }
        );
        return status;
      } catch (error) {
        setDeepSeekStatus((error && error.message) || labels.failed, { error: true });
        return null;
      }
    }

    function setRadio(name, value) {
      const input = form.querySelector("input[name='" + name + "'][value='" + value + "']");
      if (input) input.checked = true;
    }

    function setForm(settings) {
      setRadio("outputScript", settings.outputScript);
      setRadio("candidateLayout", settings.candidateLayout);
      setRadio("textOrientation", settings.textOrientation);
      colorScheme.value = settings.colorScheme;
      pageSize.value = settings.pageSize;
      fontPoint.value = settings.fontPoint;
      cornerRadius.value = settings.cornerRadius;
      inlinePreedit.checked = settings.inlinePreedit;
      englishPunctuation.checked = settings.englishPunctuation === true;
      mixedInput.checked = settings.predictor?.mixedInput !== false;
      flashPredictor.checked = settings.predictor?.flashPredictor === true;
      setSkinInputs(skinForScheme(settings.colorScheme, settings.customSkin));
      syncRangeOutputs();
    }

    function getRadio(name) {
      return form.querySelector("input[name='" + name + "']:checked")?.value;
    }

    function getForm() {
      return {
        outputScript: getRadio("outputScript"),
        candidateLayout: getRadio("candidateLayout"),
        textOrientation: getRadio("textOrientation"),
        colorScheme: colorScheme.value,
        pageSize: Number(pageSize.value),
        fontPoint: Number(fontPoint.value),
        cornerRadius: Number(cornerRadius.value),
        inlinePreedit: inlinePreedit.checked,
        englishPunctuation: englishPunctuation.checked,
        predictor: { mixedInput: mixedInput.checked, flashPredictor: flashPredictor.checked },
        customSkin: getSkinInputs()
      };
    }

    function syncRangeOutputs() {
      fontPointValue.textContent = fontPoint.value;
      cornerRadiusValue.textContent = cornerRadius.value;
      updatePreview();
    }

    function isBuiltInScheme(scheme) {
      return scheme !== "sancho_custom" && !(scheme in skinPresets);
    }

    function skinForScheme(scheme, customSkin) {
      if (scheme === "sancho_custom") {
        return customSkin || defaultCustomSkin;
      }
      if (scheme in skinPresets) {
        return skinPresets[scheme];
      }
      return null;
    }

    function setSkinInputs(skin) {
      if (!skin) {
        colorInputs.forEach((input) => { input.disabled = true; });
        customSkinName.disabled = true;
        updatePreview();
        return;
      }
      colorInputs.forEach((input) => { input.disabled = false; });
      customSkinName.disabled = false;
      customSkinName.value = skin.name;
      for (const input of colorInputs) {
        input.value = skin[input.dataset.skinField];
      }
      updatePreview();
    }

    function getSkinInputs() {
      const skin = { ...defaultCustomSkin, name: customSkinName.value };
      for (const input of colorInputs) {
        skin[input.dataset.skinField] = input.value.toUpperCase();
      }
      return skin;
    }

    function escapeHtmlClient(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    function updatePreview() {
      const scheme = colorScheme.value;
      const builtIn = isBuiltInScheme(scheme);
      if (builtIn) {
        skinPreview.style.cssText = "";
        skinPreview.classList.add("built-in-preview");
        skinPreview.classList.remove("linear", "vertical-text");
        skinPreview.innerHTML = '<span class="preview-builtin-msg">' +
          escapeHtmlClient(labels.builtInSkinPreview || "使用 Squirrel 内置配色") +
          '</span>';
        return;
      }
      skinPreview.classList.remove("built-in-preview");
      const skin = getSkinInputs();
      skinPreview.style.setProperty("--preview-back", skin.backColor);
      skinPreview.style.setProperty("--preview-border", skin.borderColor);
      skinPreview.style.setProperty("--preview-text", skin.candidateTextColor);
      skinPreview.style.setProperty("--preview-comment", skin.commentTextColor);
      skinPreview.style.setProperty("--preview-label", skin.labelColor);
      skinPreview.style.setProperty("--preview-hi-back", skin.highlightedBackColor);
      skinPreview.style.setProperty("--preview-hi-text", skin.highlightedTextColor);
      skinPreview.style.setProperty("--preview-hi-label", skin.highlightedLabelColor);
      skinPreview.style.setProperty("--preview-hi-comment", skin.highlightedCommentColor);
      skinPreview.style.fontSize = fontPoint.value + "px";
      skinPreview.style.borderRadius = cornerRadius.value + "px";
      skinPreview.classList.toggle("linear", getRadio("candidateLayout") === "linear");
      skinPreview.innerHTML = previewCandidates
        .slice(0, Math.max(3, Math.min(9, Number(pageSize.value) || 5)))
        .map(([candidate, comment], index) => {
          const active = index === 0 ? " active" : "";
          return '<div class="row-line' + active + '"><span class="label">' +
            (index + 1) + '.</span><span>' + escapeHtmlClient(candidate) +
            '</span><span class="comment">' + escapeHtmlClient(comment) + '</span></div>';
        })
        .join("");
    }

    function switchToCustomSkin() {
      if (colorScheme.value !== "sancho_custom") {
        colorScheme.value = "sancho_custom";
        colorInputs.forEach((input) => { input.disabled = false; });
        customSkinName.disabled = false;
      }
      updatePreview();
    }

    fontPoint.addEventListener("input", syncRangeOutputs);
    cornerRadius.addEventListener("input", syncRangeOutputs);
    pageSize.addEventListener("input", updatePreview);
    for (const input of form.querySelectorAll("input[name='candidateLayout']")) {
      input.addEventListener("change", updatePreview);
    }
    colorScheme.addEventListener("change", () => {
      const scheme = colorScheme.value;
      if (scheme === "sancho_custom") {
        setSkinInputs(getSkinInputs());
      } else {
        setSkinInputs(skinForScheme(scheme, getSkinInputs()));
      }
    });
    customSkinName.addEventListener("input", switchToCustomSkin);
    for (const input of colorInputs) {
      input.addEventListener("input", switchToCustomSkin);
    }

    generateSkin.addEventListener("click", async () => {
      generateSkin.disabled = true;
      setStatus(labels.aiSkinWorking);
      try {
        const result = await window.sanchoRimeSettings.suggestSkin({
          prompt: aiSkinPrompt.value,
          currentSettings: getForm()
        });
        colorScheme.value = "sancho_custom";
        setSkinInputs(result.skin);
        setStatus(result.description || labels.aiSkinApplied);
      } catch (error) {
        setStatus((error && error.message) || labels.failed, true);
      } finally {
        generateSkin.disabled = false;
      }
    });

    saveDeepSeekKey.addEventListener("click", async () => {
      saveDeepSeekKey.disabled = true;
      setDeepSeekStatus(labels.loading);
      try {
        await window.sanchoRimeSettings.saveDeepSeekKey(deepSeekApiKey.value);
        deepSeekApiKey.value = "";
        await refreshDeepSeekCredentialStatus();
        setStatus(labels.deepSeekSaved);
      } catch (error) {
        setDeepSeekStatus((error && error.message) || labels.failed, { error: true });
      } finally {
        saveDeepSeekKey.disabled = false;
      }
    });

    deleteDeepSeekKey.addEventListener("click", async () => {
      deleteDeepSeekKey.disabled = true;
      setDeepSeekStatus(labels.loading);
      try {
        await window.sanchoRimeSettings.deleteDeepSeekKey();
        await refreshDeepSeekCredentialStatus();
        setStatus(labels.deepSeekDeleted);
      } catch (error) {
        setDeepSeekStatus((error && error.message) || labels.failed, { error: true });
      } finally {
        deleteDeepSeekKey.disabled = false;
      }
    });

    refreshDeepSeekStatus.addEventListener("click", () => {
      void refreshDeepSeekCredentialStatus();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector("button[type='submit']");
      submit.disabled = true;
      setStatus(labels.loading);
      try {
        const result = await window.sanchoRimeSettings.save(getForm());
        setForm(result.settings);
        setStatus(labels.saved);
      } catch (error) {
        setStatus((error && error.message) || labels.failed, true);
      } finally {
        submit.disabled = false;
      }
    });

    document.getElementById("openDirectory").addEventListener("click", async () => {
      try {
        await window.sanchoRimeSettings.openDirectory();
      } catch (error) {
        setStatus((error && error.message) || labels.failed, true);
      }
    });

    (async () => {
      try {
        const result = await window.sanchoRimeSettings.load();
        setForm(result.settings);
        await refreshDeepSeekCredentialStatus();
        setStatus("");
      } catch (error) {
        setStatus((error && error.message) || labels.failed, true);
      }
    })();
  </script>
</body>
</html>`;
}

function renderColorSchemeOptions() {
  const sanchoOptions = Object.entries(SANCHO_SKIN_PRESETS)
    .map(([id, skin]) => `<option value="${escapeHtml(id)}">${escapeHtml(skin.name)}</option>`)
    .join("");
  return `${sanchoOptions}
            <option value="sancho_custom">Sancho Custom</option>
            <option value="native">Native</option>
            <option value="clean_white">Clean White</option>
            <option value="mojave_dark">Mojave Dark</option>
            <option value="aqua">Aqua</option>
            <option value="ink">Ink</option>
            <option value="luna">Luna</option>
            <option value="apathy">Apathy</option>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
