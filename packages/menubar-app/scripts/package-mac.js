#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  access,
  cp,
  mkdtemp,
  rm,
  symlink
} from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageDir, "../..");
const productName = "SanchoAiIME";
const archOutput = process.arch === "arm64" ? "mac-arm64" : "mac";
const archLabel = process.arch === "arm64" ? "arm64" : "x64";
const appPath = join(
  workspaceRoot,
  "dist",
  "menubar-app",
  archOutput,
  `${productName}.app`
);
const artifactDirectory = join(workspaceRoot, "dist", "menubar-app");
const dmgPath = join(artifactDirectory, `${productName}-${archLabel}.dmg`);
const zipPath = join(artifactDirectory, `${productName}-${archLabel}.zip`);

if (process.platform !== "darwin") {
  throw new Error("macOS package artifacts can only be created on macOS.");
}

await run(process.execPath, [join(packageDir, "scripts", "pack-mac-dir.js")], {
  cwd: packageDir
});
await assertExists(appPath);

const dmgSourceDirectory = await createDmgSourceDirectory();
try {
  await rm(dmgPath, { force: true });
  await run("hdiutil", [
    "create",
    "-volname",
    productName,
    "-srcfolder",
    dmgSourceDirectory,
    "-ov",
    "-format",
    "UDZO",
    dmgPath
  ]);
} finally {
  await rm(dmgSourceDirectory, { recursive: true, force: true });
}

await rm(zipPath, { force: true });
await run("ditto", [
  "-c",
  "-k",
  "--sequesterRsrc",
  "--keepParent",
  appPath,
  zipPath
]);

console.log("Created macOS package artifacts:");
console.log(`- ${dmgPath}`);
console.log(`- ${zipPath}`);

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

async function assertExists(path) {
  try {
    await access(path, constants.F_OK);
  } catch {
    throw new Error(`Expected app bundle was not created: ${path}`);
  }
}

async function createDmgSourceDirectory() {
  const sourceDirectory = await mkdtemp(join(tmpdir(), "sancho-ime-dmg-"));
  const stagedAppPath = join(sourceDirectory, `${productName}.app`);
  await cp(appPath, stagedAppPath, {
    recursive: true,
    force: true,
    verbatimSymlinks: true
  });
  await symlink("/Applications", join(sourceDirectory, "Applications"), "dir");
  await applyFinderLayout(sourceDirectory);
  return sourceDirectory;
}

async function applyFinderLayout(sourceDirectory) {
  const script = `
tell application "Finder"
  set sourceFolder to POSIX file "${escapeAppleScriptString(sourceDirectory)}" as alias
  open sourceFolder
  delay 0.5
  set sourceWindow to container window of sourceFolder
  set current view of sourceWindow to icon view
  set toolbar visible of sourceWindow to false
  set statusbar visible of sourceWindow to false
  set bounds of sourceWindow to {120, 120, 680, 430}
  set arrangement of icon view options of sourceWindow to not arranged
  set icon size of icon view options of sourceWindow to 96
  set position of item "${productName}.app" of sourceFolder to {170, 165}
  set position of item "Applications" of sourceFolder to {430, 165}
  update sourceFolder
  close sourceWindow
end tell
`;

  try {
    await run("osascript", ["-e", script]);
  } catch (error) {
    console.warn(`Warning: could not write Finder DMG layout: ${error.message}`);
  }
}

function escapeAppleScriptString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}
