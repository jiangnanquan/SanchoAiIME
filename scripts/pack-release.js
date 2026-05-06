#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

async function main(args) {
  const options = parseArgs(args);
  if (options.help) {
    printHelp();
    return;
  }

  await mkdir(options.output, { recursive: true });
  const workspaces = await discoverPackableWorkspaces();
  await runNpm([
    "pack",
    ...workspaces.flatMap((workspace) => ["--workspace", workspace]),
    "--pack-destination",
    options.output
  ]);
  console.log(`Packed workspace tarballs under ${options.output}`);
}

function parseArgs(args) {
  const parsed = {
    output: "data/release-packages"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--output") {
      parsed.output = requireValue(args, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function requireValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

async function runNpm(args) {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`npm ${args.join(" ")} exited with status ${code}`));
    });
  });
}

async function discoverPackableWorkspaces() {
  const rootPackage = JSON.parse(await readFile("package.json", "utf8"));
  const patterns = Array.isArray(rootPackage.workspaces)
    ? rootPackage.workspaces
    : Array.isArray(rootPackage.workspaces?.packages)
      ? rootPackage.workspaces.packages
      : [];

  const workspaces = [];
  for (const pattern of patterns) {
    if (!pattern.endsWith("/*") || pattern.includes("**")) {
      throw new Error(`Unsupported workspace pattern for release packing: ${pattern}`);
    }

    const parent = pattern.slice(0, -2);
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packageJson = JSON.parse(
        await readFile(join(parent, entry.name, "package.json"), "utf8")
      );
      if (packageJson.private === true) {
        continue;
      }
      workspaces.push(packageJson.name);
    }
  }

  return workspaces.sort();
}

function printHelp() {
  console.log(`Usage: node scripts/pack-release.js [--output path]

Packs all npm workspace packages into ignored release tarballs.
Default output: data/release-packages`);
}
