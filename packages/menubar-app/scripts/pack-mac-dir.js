#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  access,
  chmod,
  cp,
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageDir, "../..");
const productName = "SanchoAiIME";
const archOutput = process.arch === "arm64" ? "mac-arm64" : "mac";
const outputDir = join(workspaceRoot, "dist", "menubar-app", archOutput);
const partialApp = join(outputDir, "Electron.app");
const finalApp = join(outputDir, `${productName}.app`);

await rm(outputDir, { recursive: true, force: true });
if (await packageMacAppManually()) {
  console.log(`Packed local macOS app bundle: ${finalApp}`);
  process.exit(0);
}

const exitCode = await runElectronBuilder();
if (exitCode === 0) {
  process.exit(0);
}

if (await repairMissingMacExecutable()) {
  console.log(`Repaired local macOS app bundle: ${finalApp}`);
  process.exit(0);
}

process.exit(exitCode);

function runElectronBuilder() {
  const command = process.platform === "win32" ? "electron-builder.cmd" : "electron-builder";
  return new Promise((resolve, reject) => {
    const child = spawn(command, ["--mac", "dir"], {
      cwd: packageDir,
      stdio: "inherit"
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, Number(process.env.SANCHO_ELECTRON_BUILDER_TIMEOUT_MS ?? 120000));
    timeout.unref();
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve(code ?? 1);
    });
  });
}

async function packageMacAppManually() {
  if (process.platform !== "darwin") {
    return false;
  }

  const electronApp = join(
    workspaceRoot,
    "node_modules",
    "electron",
    "dist",
    "Electron.app"
  );
  const electronExecutable = join(electronApp, "Contents", "MacOS", "Electron");
  const asarCommand = join(
    workspaceRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "asar.cmd" : "asar"
  );
  if (!await exists(electronApp) || !await exists(electronExecutable) || !await exists(asarCommand)) {
    return false;
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "sancho-menubar-app-"));
  const stagedAppDirectory = join(temporaryDirectory, "app");
  try {
    await stageAsarInput(stagedAppDirectory);
    await mkdir(outputDir, { recursive: true });
    await cp(electronApp, finalApp, {
      recursive: true,
      force: true,
      verbatimSymlinks: true
    });
    await run(asarCommand, [
      "pack",
      stagedAppDirectory,
      join(finalApp, "Contents", "Resources", "app.asar")
    ]);
    await copyFile(
      join(packageDir, "assets", "icons", "icon.icns"),
      join(finalApp, "Contents", "Resources", "icon.icns")
    );
    await rename(
      join(finalApp, "Contents", "MacOS", "Electron"),
      join(finalApp, "Contents", "MacOS", productName)
    );
    await updateInfoPlist(join(finalApp, "Contents", "Info.plist"));
    await adHocSign(finalApp);
    return true;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function stageAsarInput(stagedAppDirectory) {
  await mkdir(stagedAppDirectory, { recursive: true });
  await cp(join(packageDir, "src"), join(stagedAppDirectory, "src"), {
    recursive: true,
    force: true
  });
  await cp(join(packageDir, "assets"), join(stagedAppDirectory, "assets"), {
    recursive: true,
    force: true
  });
  const appPkg = JSON.parse(
    await readFile(join(packageDir, "package.json"), "utf8")
  );
  await writeFile(
    join(stagedAppDirectory, "package.json"),
    JSON.stringify({
      name: "@sancho-ai-ime/menubar-app",
      version: appPkg.version,
      private: true,
      type: "module",
      main: "src/main.js"
    }, null, 2),
    "utf8"
  );

  const scopeDirectory = join(stagedAppDirectory, "node_modules", "@sancho-ai-ime");
  await mkdir(scopeDirectory, { recursive: true });
  for (const packageName of ["cloud-teacher", "dashboard", "quick-dictionary", "model-orchestrator"]) {
    await mkdir(join(scopeDirectory, packageName), { recursive: true });
    await cp(
      join(workspaceRoot, "packages", packageName, "src"),
      join(scopeDirectory, packageName, "src"),
      { recursive: true, force: true }
    );
    await copyFile(
      join(workspaceRoot, "packages", packageName, "package.json"),
      join(scopeDirectory, packageName, "package.json")
    );
  }
}

async function updateInfoPlist(plistPath) {
  await run("plutil", ["-replace", "CFBundleExecutable", "-string", productName, plistPath]);
  await run("plutil", ["-replace", "CFBundleName", "-string", productName, plistPath]);
  await run("plutil", ["-replace", "CFBundleDisplayName", "-string", productName, plistPath]);
  await run("plutil", ["-replace", "CFBundleIdentifier", "-string", "ai.sancho.ime", plistPath]);
  await run("plutil", ["-replace", "CFBundleIconFile", "-string", "icon.icns", plistPath]);
  await run("plutil", ["-replace", "LSUIElement", "-bool", "YES", plistPath]);
  await run("plutil", [
    "-replace",
    "NSHumanReadableCopyright",
    "-string",
    "Copyright SanchoAiIME contributors",
    plistPath
  ]);
}

async function repairMissingMacExecutable() {
  const asarPath = join(partialApp, "Contents", "Resources", "app.asar");
  const electronApp = join(
    workspaceRoot,
    "node_modules",
    "electron",
    "dist",
    "Electron.app"
  );
  const electronExecutable = join(
    electronApp,
    "Contents",
    "MacOS",
    "Electron"
  );
  const targetExecutable = join(
    partialApp,
    "Contents",
    "MacOS",
    productName
  );

  if (!await exists(asarPath) || !await exists(electronApp) || !await exists(electronExecutable)) {
    return false;
  }

  await repairElectronRuntime(partialApp, electronApp);
  await mkdir(dirname(targetExecutable), { recursive: true });
  await copyFile(electronExecutable, targetExecutable);
  await chmod(targetExecutable, 0o755);
  await rm(finalApp, { recursive: true, force: true });
  await rename(partialApp, finalApp);
  await adHocSign(finalApp);
  return true;
}

async function repairElectronRuntime(appPath, electronApp) {
  const sourceFrameworks = join(electronApp, "Contents", "Frameworks");
  const targetFrameworks = join(appPath, "Contents", "Frameworks");
  await rm(targetFrameworks, { recursive: true, force: true });
  await cp(sourceFrameworks, targetFrameworks, {
    recursive: true,
    force: true,
    verbatimSymlinks: true
  });
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function adHocSign(appPath) {
  if (process.platform !== "darwin") {
    return;
  }
  const code = await new Promise((resolve, reject) => {
    const child = spawn("codesign", [
      "--force",
      "--deep",
      "--sign",
      "-",
      appPath
    ], {
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("close", (status) => resolve(status ?? 1));
  });
  if (code !== 0) {
    throw new Error(`codesign exited with status ${code}`);
  }
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? packageDir,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      reject(new Error(`${command} exited with status ${code ?? 1}`));
    });
  });
}
