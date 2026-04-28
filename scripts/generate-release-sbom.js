#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import { buildReleaseSbom, writeReleaseSbom } from "./release-sbom.js";

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

  if (options.output) {
    await writeReleaseSbom(options.output, {
      rootDir: process.cwd(),
      createdAt: options.createdAt
    });
    console.log(`Wrote release SBOM: ${options.output}`);
    return;
  }

  const sbom = await buildReleaseSbom({
    rootDir: process.cwd(),
    createdAt: options.createdAt
  });
  process.stdout.write(`${JSON.stringify(sbom, null, 2)}\n`);
}

function parseArgs(args) {
  const parsed = {};

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
    if (arg === "--created-at") {
      parsed.createdAt = requireValue(args, index, arg);
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

function printHelp() {
  console.log(`Usage: node scripts/generate-release-sbom.js [--output path] [--created-at iso-time]

Generates an SPDX 2.3 JSON SBOM for SanchoAiIME release inputs.
Write outputs under ignored runtime paths such as data/release-sbom.spdx.json.`);
}
