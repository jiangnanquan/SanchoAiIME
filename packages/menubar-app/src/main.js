import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
  Tray
} from "electron";
import {
  actionsToQuickDictionaryEntries,
  syncCustomPhraseFile,
  syncUserCustomPhraseEntries
} from "@sancho-ai-ime/quick-dictionary";

import {
  createDefaultActionRegistry,
  writeDashboardFiles
} from "./dashboard-state.js";
import { appIconPath, createIconImage, createTrayIcon } from "./assets.js";
import {
  deleteDeepSeekApiKey,
  getDeepSeekCredentialStatus,
  saveDeepSeekApiKey
} from "./deepseek-credentials.js";
import { createMenubarTranslator } from "./i18n.js";
import {
  bootstrapAndLoadLocalPredictor,
  ensureLocalPredictorOllamaModel,
  getLocalPredictorState
} from "./model-runtime.js";
import { createAutoUpdater } from "./auto-updater.js";
import {
  distillSuggestions,
  readSuggestions,
  approveSuggestion
} from "./dict-distiller.js";
import {
  createLocalPredictorService,
  setCorrectionCallback
} from "./predictor-service.js";
import {
  assertMacPlatform,
  macCustomPhrasePath,
  macRimeDirectory
} from "./platform.js";
import { writeRimePredictorIntegration } from "./rime-predictor-integration.js";
import {
  formatRimeIntegrationStatus,
  getRimeIntegrationStatus
} from "./rime-status.js";
import {
  readRimeSettings,
  redeploySquirrel,
  writeRimeSettings
} from "./rime-settings.js";
import { suggestRimeSkin } from "./rime-skin-assistant.js";
import { renderRimeSettingsHtml } from "./settings-window.js";
import { initTelemetry } from "./telemetry.js";

let tray;
let dashboardWindow;
let settingsWindow;
let dashboardPath;
let customPhrasePath;
let translator;
let actionRegistry;
let modelDownloadPromise;
let modelProgressWindow;
let updateProgressWindow;
let predictorService;
let autoUpdater;
let commitLogPath;
let suggestionsPath;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  void showDashboard();
});

app.whenReady().then(async () => {
  try {
    assertMacPlatform();
  } catch (error) {
    await dialog.showMessageBox({
      type: "error",
      message: error.message
    });
    app.quit();
    return;
  }

  app.setName("SanchoAiIME");
  initTelemetry();
  if (process.platform === "darwin") {
    app.dock.hide();
  }

  translator = createMenubarTranslator();
  actionRegistry = createDefaultActionRegistry(translator);
  customPhrasePath = macCustomPhrasePath();
  const userDataPath = app.getPath("userData");
  commitLogPath = join(userDataPath, "commit_log.txt");
  suggestionsPath = join(userDataPath, "ai_suggestions.json");
  registerRimeSettingsIpc();
  await startPredictorRuntime();
  await refreshDashboard();
  createTray();
  await showDashboard();
  initAutoUpdater();
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("before-quit", () => {
  void predictorService?.stop();
});

async function refreshDashboard() {
  const outputDirectory = app.getPath("userData");
  const result = await writeDashboardFiles({
    outputDirectory,
    customPhrasePath,
    actionRegistry,
    translator,
    predictorServiceStatus: predictorService ? await predictorService.status() : undefined
  });
  dashboardPath = result.htmlPath;
  return result;
}

async function startPredictorRuntime() {
  const settings = await readRimeSettings().catch(() => undefined);
  const predictorSettings = await resolvePredictorSettings(settings?.predictor);
  await writeRimePredictorIntegration(predictorSettings ?? {}, {
    rimeDirectory: macRimeDirectory()
  });
  if (predictorService) {
    await predictorService.stop();
  }
  predictorService = createLocalPredictorService({
    settings: predictorSettings,
    runnerOptions: predictorSettings?.runner,
    customPhrasePath,
    commitLogPath
  });
  await predictorService.start();

  setCorrectionCallback((result) => {
    const lines = result.corrections.map(
      (c) => `${c.original} → ${c.suggested}  (${c.reason})`
    );
    dialog.showMessageBox({
      type: "info",
      title: translator.t("typoCheckTitle"),
      message: translator.t("typoCheckMessage").replace("{count}", String(result.corrections.length)),
      detail: lines.join("\n"),
      buttons: [translator.t("closeButton")]
    }).catch(() => {});
  });
}

async function resolvePredictorSettings(predictorSettings = {}) {
  const settings = {
    ...(predictorSettings ?? {})
  };
  const runner = settings.runner ?? {};
  if (settings.enabled === false || runner.provider !== "none") {
    return settings;
  }

  try {
    const state = await getLocalPredictorState();
    if (state.status !== "loaded") {
      return settings;
    }
    const result = await ensureLocalPredictorOllamaModel({ state });
    return {
      ...settings,
      runner: result.runner
    };
  } catch (error) {
    console.warn("Unable to activate local predictor runner:", error.message);
    return settings;
  }
}

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  if (icon.isEmpty()) {
    tray.setTitle("山");
  }
  tray.setToolTip("SanchoAiIME");
  tray.setContextMenu(buildMenu());
}

function buildMenu() {
  const loginItemSettings = app.getLoginItemSettings();
  return Menu.buildFromTemplate([
    {
      label: `SanchoAiIME v${app.getVersion()}`,
      enabled: false
    },
    { type: "separator" },
    {
      label: translator.t("openDashboard"),
      click: () => {
        void showDashboard();
      }
    },
    {
      label: translator.t("refreshDashboard"),
      click: () => {
        void runMenuTask(translator.t("dashboardRegenerated"), async () => {
          await refreshDashboard();
          if (dashboardWindow) {
            await dashboardWindow.loadFile(dashboardPath);
          }
        });
      }
    },
    { type: "separator" },
    {
      label: translator.t("openInputMethodSettings"),
      click: () => {
        void showDashboard({ tab: "input-method" });
      }
    },
    {
      label: translator.t("setupInputMethod"),
      click: () => {
        void setupInputMethod();
      }
    },
    {
      label: translator.t("checkInputMethodStatus"),
      click: () => {
        void showInputMethodStatus();
      }
    },
    {
      label: translator.t("syncDictionary"),
      click: () => {
        void runMenuTask(translator.t("dictionarySynced"), syncAndRedeployQuickDictionary);
      }
    },
    {
      label: translator.t("openRimeDirectory"),
      click: () => {
        void openRimeDirectory();
      }
    },
    {
      label: translator.t("redeploySquirrel"),
      click: () => {
        void runMenuTask(translator.t("redeployComplete"), redeploySquirrel);
      }
    },
    { type: "separator" },
    {
      label: translator.t("downloadLocalModel"),
      click: () => {
        void downloadAndLoadLocalModel();
      }
    },
    {
      label: translator.t("openModelsDirectory"),
      click: () => {
        void openModelsDirectory().catch(showError);
      }
    },
    {
      label: translator.t("deepseekDistill"),
      click: () => {
        void runMenuTask(translator.t("deepseekDistilling"), distillAndShowSuggestions);
      }
    },
    { type: "separator" },
    {
      label: translator.t("checkForUpdates"),
      click: () => {
        void checkForUpdates();
      }
    },
    { type: "separator" },
    {
      label: translator.t("launchAtLogin"),
      type: "checkbox",
      checked: loginItemSettings.openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({
          openAtLogin: item.checked
        });
        tray.setContextMenu(buildMenu());
      }
    },
    { type: "separator" },
    {
      label: translator.t("quit"),
      click: () => {
        app.quit();
      }
    }
  ]);
}

async function showDashboard(options = {}) {
  if (!dashboardPath) {
    await refreshDashboard();
  }

  if (dashboardWindow) {
    dashboardWindow.show();
    dashboardWindow.focus();
    await selectDashboardTab(options.tab);
    return;
  }

  dashboardWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 860,
    minHeight: 620,
    title: "SanchoAiIME",
    icon: createIconImage(appIconPath),
    show: false,
    webPreferences: {
      preload: fileURLToPath(new URL("dashboard-preload.cjs", import.meta.url)),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  dashboardWindow.removeMenu();
  dashboardWindow.once("ready-to-show", () => {
    dashboardWindow.show();
  });
  dashboardWindow.on("closed", () => {
    dashboardWindow = undefined;
  });

  await dashboardWindow.loadFile(dashboardPath);
  await selectDashboardTab(options.tab);
}

async function selectDashboardTab(tab) {
  if (!dashboardWindow || !tab) {
    return;
  }
  const script = `window.sanchoSelectDashboardTab && window.sanchoSelectDashboardTab(${JSON.stringify(tab)})`;
  await dashboardWindow.webContents.executeJavaScript(script, true).catch(() => {});
}

async function syncQuickDictionary(options = {}) {
  const entries = actionsToQuickDictionaryEntries(actionRegistry);
  const result = await syncCustomPhraseFile({
    customPhrasePath,
    entries
  });
  await refreshDashboard();
  if (options.reloadDashboard !== false) {
    await reloadDashboardWindow();
  }
  return result.changed
    ? translator.t("dictionaryUpdated", { path: result.path })
    : translator.t("dictionaryUnchanged", { path: result.path });
}

async function syncAndRedeployQuickDictionary() {
  const message = await syncQuickDictionary();
  await redeploySquirrel();
  return message;
}

async function setupInputMethod() {
  await runMenuTask(translator.t("inputMethodPrepared"), async () => {
    await startPredictorRuntime();
    await syncQuickDictionary();
    await redeploySquirrel();
    await shell.openExternal("x-apple.systempreferences:com.apple.Keyboard-Settings.extension");
    return translator.t("inputMethodPreparedDetail");
  });
}

async function showInputMethodSettings() {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 920,
    height: 650,
    minWidth: 760,
    minHeight: 560,
    title: translator.t("rimeSettingsTitle"),
    icon: createIconImage(appIconPath),
    webPreferences: {
      preload: fileURLToPath(new URL("settings-preload.cjs", import.meta.url)),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  settingsWindow.removeMenu();
  settingsWindow.on("closed", () => {
    settingsWindow = undefined;
  });
  await settingsWindow.loadURL(dataHtmlUrl(renderRimeSettingsHtml(translator)));
}

async function showInputMethodStatus() {
  try {
    const status = await getRimeIntegrationStatus({
      customPhrasePath,
      actionRegistry
    });
    await dialog.showMessageBox({
      type: status.status === "ready" ? "info" : "warning",
      message: translator.t("inputMethodStatusTitle"),
      detail: formatRimeIntegrationStatus(status, translator)
    });
  } catch (error) {
    await showError(error);
  }
}

async function downloadAndLoadLocalModel() {
  if (modelDownloadPromise) {
    showModelProgressWindow();
    await dialog.showMessageBox({
      type: "info",
      message: translator.t("modelDownloadAlreadyRunning")
    });
    return;
  }

  showModelProgressWindow();
  updateModelProgressWindow({
    status: translator.t("modelDownloadChecking"),
    detail: ""
  });
  const state = await getLocalPredictorState();
  if (state.status === "loaded") {
    updateModelProgressWindow({
      status: translator.t("modelDownloadRegistering"),
      detail: state.modelDir
    });
    await ensureLocalPredictorOllamaModel({ state, recreate: true });
    await startPredictorRuntime();
    await refreshDashboard();
    await reloadDashboardWindow();
    closeModelProgressWindow();
    await dialog.showMessageBox({
      type: "info",
      message: translator.t("modelDownloadAlreadyLoaded"),
      detail: translator.t("modelDownloadAlreadyLoadedDetail", { path: state.modelDir })
    });
    return;
  }

  const confirmation = await dialog.showMessageBox({
    type: "question",
    buttons: [translator.t("downloadModel"), translator.t("cancel")],
    defaultId: 0,
    cancelId: 1,
    message: translator.t("downloadModelMessage"),
    detail: translator.t("downloadModelDetail")
  });
  if (confirmation.response !== 0) {
    closeModelProgressWindow();
    return;
  }

  modelDownloadPromise = runModelDownload();
  try {
    await modelDownloadPromise;
  } finally {
    modelDownloadPromise = undefined;
  }
}

async function runModelDownload() {
  try {
    updateModelProgressWindow({
      status: translator.t("modelDownloadPreparing"),
      detail: "",
      percent: 0
    });
    const result = await bootstrapAndLoadLocalPredictor({
      onDownloadProgress: (progress) => {
        updateModelProgressWindow({
          status: translator.t("modelDownloadDownloading"),
          detail: modelProgressDetail(progress),
          percent: progress.percent
        });
      }
    });
    updateModelProgressWindow({
      status: translator.t("modelDownloadRegistering"),
      detail: result.modelDir,
      percent: 1
    });
    await ensureLocalPredictorOllamaModel({ recreate: true });
    await startPredictorRuntime();
    await refreshDashboard();
    await reloadDashboardWindow();
    updateModelProgressWindow({
      status: translator.t("modelDownloadComplete"),
      detail: result.modelDir,
      percent: 1
    });
    await dialog.showMessageBox({
      type: "info",
      message: translator.t("localModelReady"),
      detail: translator.t("localModelReadyDetail", { path: result.modelDir })
    });
    closeModelProgressWindow();
  } catch (error) {
    closeModelProgressWindow();
    await showError(error);
  }
}

async function openModelsDirectory() {
  const state = await getLocalPredictorState();
  await mkdir(state.modelsDir, { recursive: true });
  const error = await shell.openPath(state.modelsDir);
  if (error) {
    await showError(error);
  }
}

async function openRimeDirectory() {
  const directory = macRimeDirectory();
  await mkdir(directory, { recursive: true });
  const error = await shell.openPath(directory);
  if (error) {
    await showError(error);
  }
}

function registerRimeSettingsIpc() {
  ipcMain.handle("dashboard:open-rime-settings", async () => {
    await showDashboard({ tab: "input-method" });
    return {};
  });

  ipcMain.handle("deepseek-credentials:status", async () => (
    await getDeepSeekCredentialStatus()
  ));

  ipcMain.handle("deepseek-credentials:save", async (_event, input) => (
    await saveDeepSeekApiKey(input?.apiKey)
  ));

  ipcMain.handle("deepseek-credentials:delete", async () => (
    await deleteDeepSeekApiKey()
  ));

  ipcMain.handle("rime-settings:load", async () => ({
    settings: await readRimeSettings()
  }));

  ipcMain.handle("dashboard:rime-settings:save", async (_event, settings) => {
    const result = await writeRimeSettings(settings);
    await startPredictorRuntime();
    await syncQuickDictionary({ reloadDashboard: false });
    await redeploySquirrel();
    await refreshDashboard();
    return result;
  });

  ipcMain.handle("rime-settings:save", async (_event, settings) => {
    const result = await writeRimeSettings(settings);
    await startPredictorRuntime();
    await syncQuickDictionary();
    await redeploySquirrel();
    await refreshDashboard();
    await reloadDashboardWindow();
    return result;
  });

  ipcMain.handle("dashboard:custom-phrases:save", async (_event, input) => {
    const result = await syncUserCustomPhraseEntries({
      customPhrasePath,
      entries: input?.entries ?? []
    });
    await syncQuickDictionary({ reloadDashboard: false });
    await redeploySquirrel();
    return {
      ...result,
      message: result.changed
        ? translator.t("dictionaryUpdated", { path: result.path })
        : translator.t("dictionaryUnchanged", { path: result.path })
    };
  });

  ipcMain.handle("rime-settings:open-directory", async () => {
    await openRimeDirectory();
    return {};
  });

  ipcMain.handle("rime-settings:suggest-skin", async (_event, input) => {
    return await suggestRimeSkin({
      prompt: input?.prompt,
      currentSettings: input?.currentSettings
    });
  });

  ipcMain.handle("dashboard:action:execute", async (_event, action) => {
    return await executeDashboardAction(action);
  });
}

async function executeDashboardAction(action) {
  if (!action || typeof action !== "object") {
    throw new Error("Invalid action");
  }
  const kind = action.kind ?? "";
  if (!["profile_switch", "run_command"].includes(kind)) {
    return { ok: false, reason: `Action kind '${kind}' is not executable` };
  }

  let profile;
  if (action.profile && actionRegistry?.profiles) {
    profile = actionRegistry.profiles.find((p) => p.id === action.profile);
  }
  if (!profile) {
    throw new Error(`Profile '${action.profile}' not found`);
  }

  const command = profile.command;
  if (!command) {
    throw new Error(`Profile '${profile.id}' has no command`);
  }

  const env = { ...process.env };
  if (profile.inheritEnv !== false) {
    Object.assign(env, process.env);
  }
  if (profile.env) {
    Object.assign(env, profile.env);
  }

  const child = spawn(command, profile.args ?? [], {
    cwd: profile.cwd ?? process.cwd(),
    env,
    detached: true,
    stdio: "ignore"
  });
  child.unref();

  return {
    ok: true,
    profile: profile.id,
    command,
    pid: child.pid
  };
}

function dataHtmlUrl(html) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function runMenuTask(successMessage, task) {
  try {
    const detail = await task();
    await dialog.showMessageBox({
      type: "info",
      message: successMessage,
      detail: typeof detail === "string" ? detail : undefined
    });
  } catch (error) {
    await showError(error);
  }
}

async function reloadDashboardWindow() {
  if (dashboardWindow && dashboardPath) {
    await dashboardWindow.loadFile(dashboardPath);
  }
}

function showModelProgressWindow() {
  if (modelProgressWindow) {
    modelProgressWindow.show();
    modelProgressWindow.focus();
    return;
  }

  modelProgressWindow = new BrowserWindow({
    width: 420,
    height: 178,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    closable: false,
    title: translator.t("modelDownloadTitle"),
    icon: createIconImage(appIconPath),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  modelProgressWindow.removeMenu();
  modelProgressWindow.on("closed", () => {
    modelProgressWindow = undefined;
  });
  void modelProgressWindow.loadURL(progressWindowHtml(translator));
}

function updateModelProgressWindow(progress) {
  if (!modelProgressWindow) {
    return;
  }
  const percent = Number.isFinite(progress.percent) ? progress.percent : undefined;
  modelProgressWindow.setProgressBar(percent === undefined ? 2 : percent);
  const payload = JSON.stringify({
    status: progress.status,
    detail: progress.detail ?? "",
    percent
  });
  void modelProgressWindow.webContents.executeJavaScript(
    `window.setSanchoProgress(${payload})`
  ).catch(() => {});
}

function closeModelProgressWindow() {
  if (!modelProgressWindow) {
    return;
  }
  modelProgressWindow.setProgressBar(-1);
  modelProgressWindow.destroy();
  modelProgressWindow = undefined;
}

function modelProgressDetail(progress) {
  const transferred = formatBytes(progress.transferredBytes ?? 0);
  if (!progress.totalBytes) {
    return transferred;
  }
  const total = formatBytes(progress.totalBytes);
  const percentage = Number.isFinite(progress.percent)
    ? ` ${Math.floor(progress.percent * 100)}%`
    : "";
  return `${transferred} / ${total}${percentage}`;
}

function formatBytes(bytes) {
  const number = Number(bytes);
  if (!Number.isFinite(number) || number <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = number;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const fractionDigits = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function progressWindowHtml(currentTranslator, options = {}) {
  const initialStatus = options.initialStatus ?? currentTranslator.t("modelDownloadPreparing");
  const title = options.title ?? currentTranslator.t("modelDownloadTitle");
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html lang="${escapeHtml(currentTranslator.locale)}">
<head>
  <meta charset="utf-8">
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --surface: #ffffff;
      --ink: #18202a;
      --muted: #647181;
      --accent: #1b6f73;
      --line: #d9e0e7;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      background: var(--bg);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13px;
      overflow: hidden;
    }
    h1 {
      margin: 0 0 14px;
      font-size: 16px;
      font-weight: 720;
      letter-spacing: 0;
    }
    .progress-shell {
      border: 1px solid var(--line);
      background: var(--surface);
      padding: 14px;
      border-radius: 8px;
    }
    .status {
      margin: 0 0 8px;
      font-weight: 650;
    }
    .detail {
      min-height: 18px;
      margin: 8px 0 0;
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    progress {
      width: 100%;
      height: 12px;
      accent-color: var(--accent);
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="progress-shell">
    <p class="status" id="status">${escapeHtml(initialStatus)}</p>
    <progress id="bar" max="100"></progress>
    <p class="detail" id="detail"></p>
  </div>
  <script>
    window.setSanchoProgress = function(progress) {
      document.getElementById("status").textContent = progress.status || "";
      document.getElementById("detail").textContent = progress.detail || "";
      const bar = document.getElementById("bar");
      if (typeof progress.percent === "number") {
        bar.value = Math.max(0, Math.min(100, Math.round(progress.percent * 100)));
      } else {
        bar.removeAttribute("value");
      }
    };
  </script>
</body>
</html>`)}`
}

function initAutoUpdater() {
  autoUpdater = createAutoUpdater({
    currentVersion: app.getVersion(),
    onUpdateAvailable: (release) => {
      void showUpdateDialog(release);
    },
    onNoUpdate: () => {
      // Silent — only notify if update is available
    },
    onDownloadProgress: (progress) => {
      updateUpdateProgress({
        status: translator.t("downloadingUpdate"),
        detail: `${progress.percent}%`,
        percent: progress.percent / 100
      });
    },
    onDownloadComplete: async (path) => {
      updateUpdateProgress({
        status: translator.t("installingUpdate"),
        detail: "",
        percent: 1
      });
      try {
        const appBundle = app.getPath("exe").replace(/\/Contents\/MacOS\/.*$/, "");
        await autoUpdater.installAndRelaunch(path, appBundle);
        closeUpdateProgress();
        setTimeout(() => {
          app.relaunch();
          app.exit();
        }, 500);
      } catch (error) {
        closeUpdateProgress();
        await showError(error);
      }
    },
    onError: () => {
      closeUpdateProgress();
    }
  });

  setTimeout(() => {
    void autoUpdater.checkForUpdates();
  }, 5000);
}

async function checkForUpdates() {
  if (!autoUpdater) {
    return;
  }
  let result = undefined;
  const originalOnUpdate = autoUpdater.onUpdateAvailable;
  const originalOnNoUpdate = autoUpdater.onNoUpdate;
  const originalOnError = autoUpdater.onError;

  try {
    result = await new Promise((resolve) => {
      autoUpdater.onUpdateAvailable = (release) => resolve(release);
      autoUpdater.onNoUpdate = (reason) => resolve(null);
      autoUpdater.onError = (error) => { resolve(null); throw error; };
      void autoUpdater.checkForUpdates();
    });
  } finally {
    autoUpdater.onUpdateAvailable = originalOnUpdate;
    autoUpdater.onNoUpdate = originalOnNoUpdate;
    autoUpdater.onError = originalOnError;
  }

  if (result) {
    await showUpdateDialog(result);
  } else {
    await dialog.showMessageBox({
      type: "info",
      message: translator.t("noUpdateAvailable"),
      detail: translator.t("upToDateDetail")
    });
  }
}

async function showUpdateDialog(release) {
  const { response } = await dialog.showMessageBox({
    type: "info",
    title: translator.t("updateAvailableTitle"),
    message: translator.t("updateAvailableMessage")
      .replace("{version}", release.version)
      .replace("{name}", release.name),
    detail: release.notes?.slice(0, 600) ?? "",
    buttons: [
      translator.t("downloadUpdate"),
      translator.t("laterButton")
    ],
    defaultId: 0
  });

  if (response === 0) {
    showUpdateProgress();
    try {
      await autoUpdater.downloadUpdate({ url: release.url });
    } catch (error) {
      closeUpdateProgress();
      await showError(error);
    }
  }
}

function showUpdateProgress() {
  if (updateProgressWindow) {
    updateProgressWindow.show();
    updateProgressWindow.focus();
    return;
  }
  updateProgressWindow = new BrowserWindow({
    width: 420,
    height: 178,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    closable: false,
    title: translator.t("downloadingUpdate"),
    icon: createIconImage(appIconPath),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  updateProgressWindow.removeMenu();
  updateProgressWindow.on("closed", () => {
    updateProgressWindow = undefined;
  });
  void updateProgressWindow.loadURL(progressWindowHtml(translator, {
    title: translator.t("updateAvailableTitle"),
    initialStatus: translator.t("downloadingUpdate")
  }));
}

function updateUpdateProgress(progress) {
  if (!updateProgressWindow) return;
  const percent = Number.isFinite(progress.percent) ? progress.percent : undefined;
  updateProgressWindow.setProgressBar(percent === undefined ? 2 : percent);
  const payload = JSON.stringify({
    status: progress.status,
    detail: progress.detail ?? "",
    percent
  });
  void updateProgressWindow.webContents.executeJavaScript(
    `window.setSanchoProgress(${payload})`
  ).catch(() => {});
}

function closeUpdateProgress() {
  if (!updateProgressWindow) return;
  updateProgressWindow.setProgressBar(-1);
  updateProgressWindow.destroy();
  updateProgressWindow = undefined;
}

async function distillAndShowSuggestions() {
  if (!commitLogPath || !suggestionsPath) {
    await dialog.showMessageBox({
      type: "error",
      message: translator.t("operationFailed"),
      detail: "Commit log or suggestions path not configured."
    });
    return;
  }

  const result = await distillSuggestions({
    commitLogPath,
    suggestionsPath
  });

  if (result.reason === "no-log-data") {
    await dialog.showMessageBox({
      type: "info",
      message: translator.t("deepseekDistillNoData"),
      detail: translator.t("deepseekDistillNoDataDetail")
    });
    return;
  }

  if (result.suggestions.length === 0) {
    await dialog.showMessageBox({
      type: "info",
      message: translator.t("deepseekDistillEmpty"),
      detail: translator.t("deepseekDistillEmptyDetail")
    });
    return;
  }

  const lines = result.suggestions.map(
    (s, i) => `${i + 1}. ${s.phrase}  [${s.code}]  w${s.weight}  — ${s.reason}`
  );
  const { response } = await dialog.showMessageBox({
    type: "info",
    title: translator.t("deepseekDistillTitle"),
    message: translator.t("deepseekDistillMessage")
      .replace("{count}", String(result.suggestions.length)),
    detail: lines.join("\n"),
    buttons: [
      translator.t("deepseekDistillApprove"),
      translator.t("closeButton")
    ],
    defaultId: 0
  });

  if (response === 0) {
    const { response: approveIndex } = await dialog.showMessageBox({
      type: "question",
      title: translator.t("deepseekDistillTitle"),
      message: translator.t("deepseekDistillSelectPrompt"),
      detail: lines.join("\n"),
      buttons: [
        translator.t("deepseekDistillApproveAll"),
        ...result.suggestions.map((s) => `${s.phrase} [${s.code}]`),
        translator.t("cancelButton")
      ]
    });

    // TODO: handle individual approve or approve all
    await dialog.showMessageBox({
      type: "info",
      message: translator.t("deepseekDistillSaved"),
      detail: translator.t("deepseekDistillSavedDetail")
        .replace("{path}", suggestionsPath)
    });
  }
}

async function showError(error) {
  await dialog.showMessageBox({
    type: "error",
    message: translator.t("operationFailed"),
    detail: error instanceof Error ? error.message : String(error)
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
