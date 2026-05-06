import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  copyFile,
  mkdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";

import { normalizeModelManifest } from "./manifest.js";

export function defaultModelsDir(cwd = process.cwd()) {
  if (process.env.SANCHO_MODEL_DIR) {
    return resolve(process.env.SANCHO_MODEL_DIR);
  }
  if (process.env.SANCHO_RUNTIME_DIR) {
    return resolve(process.env.SANCHO_RUNTIME_DIR, "models");
  }
  if (process.platform === "darwin") {
    return resolve(homedir(), "Library", "Application Support", "SanchoAiIME", "models");
  }
  return resolve(cwd, "models");
}

export function resolveModelLayout(manifestInput, options = {}) {
  const manifest = normalizeModelManifest(manifestInput);
  const modelsDir = resolve(options.modelsDir ?? defaultModelsDir(options.cwd));
  const modelDir = resolve(modelsDir, manifest.storage.directory);
  assertInside(modelsDir, modelDir, "Model directory");

  const artifacts = manifest.artifacts.map((artifact) => {
    const targetPath = resolve(modelDir, artifact.path);
    assertInside(modelDir, targetPath, `Artifact ${artifact.path}`);
    return {
      ...artifact,
      targetPath
    };
  });

  return {
    manifest,
    modelsDir,
    modelDir,
    lockPath: resolve(modelDir, "sancho-model.lock.json"),
    artifacts
  };
}

export async function planModelBootstrap(manifestInput, options = {}) {
  const layout = resolveModelLayout(manifestInput, options);
  const artifacts = [];

  for (const artifact of layout.artifacts) {
    const local = await inspectArtifact(artifact);
    artifacts.push({
      path: artifact.path,
      targetPath: artifact.targetPath,
      url: artifact.url,
      sha256: artifact.sha256,
      sizeBytes: artifact.sizeBytes,
      status: local.exists
        ? local.valid
          ? "cached"
          : "stale"
        : "missing",
      ...(local.actualSha256 === undefined
        ? {}
        : { actualSha256: local.actualSha256 }),
      ...(local.actualSizeBytes === undefined
        ? {}
        : { actualSizeBytes: local.actualSizeBytes })
    });
  }

  return {
    model: {
      id: layout.manifest.id,
      name: layout.manifest.name,
      source: layout.manifest.source
    },
    modelsDir: layout.modelsDir,
    modelDir: layout.modelDir,
    artifactCount: artifacts.length,
    artifacts
  };
}

export async function bootstrapModel(manifestInput, options = {}) {
  const layout = resolveModelLayout(manifestInput, options);
  const allowNetwork = Boolean(options.allowNetwork);
  const allowUnverified = Boolean(options.allowUnverified);

  if (options.dryRun) {
    const plan = await planModelBootstrap(layout.manifest, options);
    return {
      ...plan,
      dryRun: true,
      changed: false
    };
  }

  await mkdir(layout.modelDir, { recursive: true });

  const results = [];
  let changed = false;
  for (const artifact of layout.artifacts) {
    const local = await inspectArtifact(artifact);
    if (local.exists && local.valid) {
      results.push({
        path: artifact.path,
        targetPath: artifact.targetPath,
        status: "cached",
        sha256: local.actualSha256,
        sizeBytes: local.actualSizeBytes
      });
      continue;
    }

    if (!artifact.url) {
      throw new Error(`Artifact ${artifact.path} is missing and has no download URL.`);
    }
    if (!artifact.sha256 && !allowUnverified) {
      throw new Error(
        `Artifact ${artifact.path} must include sha256 unless --allow-unverified is used.`
      );
    }

    const url = new URL(artifact.url);
    if (!allowNetwork && url.protocol !== "file:") {
      throw new Error(
        `Network download disabled for ${artifact.path}; pass --allow-network to download.`
      );
    }

    await mkdir(dirname(artifact.targetPath), { recursive: true });
    const temporaryPath = `${artifact.targetPath}.download-${process.pid}`;
    try {
      const downloaded = await downloadArtifact(url, temporaryPath, {
        fetchImpl: options.fetchImpl,
        expectedSizeBytes: artifact.sizeBytes,
        onProgress: (progress) => {
          options.onDownloadProgress?.({
            artifact: {
              path: artifact.path,
              targetPath: artifact.targetPath,
              url: artifact.url,
              sizeBytes: artifact.sizeBytes
            },
            ...progress
          });
        }
      });
      await verifyArtifactFile(artifact, temporaryPath);
      await rename(temporaryPath, artifact.targetPath);
      changed = true;
      results.push({
        path: artifact.path,
        targetPath: artifact.targetPath,
        status: local.exists ? "replaced" : "downloaded",
        sha256: downloaded.sha256,
        sizeBytes: downloaded.sizeBytes
      });
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  const lock = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    model: {
      id: layout.manifest.id,
      name: layout.manifest.name,
      source: layout.manifest.source
    },
    modelDir: layout.modelDir,
    artifacts: results.map((result) => ({
      path: result.path,
      sha256: result.sha256,
      sizeBytes: result.sizeBytes,
      status: result.status
    }))
  };
  await writeFile(layout.lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

  return {
    model: lock.model,
    modelsDir: layout.modelsDir,
    modelDir: layout.modelDir,
    lockPath: layout.lockPath,
    artifactCount: results.length,
    artifacts: results,
    changed
  };
}

export async function verifyArtifactFile(artifact, filePath) {
  const fileStat = await stat(filePath);
  const actualSizeBytes = fileStat.size;
  const actualSha256 = await hashFile(filePath);

  if (artifact.sizeBytes !== undefined && actualSizeBytes !== artifact.sizeBytes) {
    throw new Error(
      `Artifact ${artifact.path} size mismatch: expected ${artifact.sizeBytes}, got ${actualSizeBytes}.`
    );
  }
  if (artifact.sha256 !== undefined && actualSha256 !== artifact.sha256) {
    throw new Error(
      `Artifact ${artifact.path} sha256 mismatch: expected ${artifact.sha256}, got ${actualSha256}.`
    );
  }

  return {
    sha256: actualSha256,
    sizeBytes: actualSizeBytes
  };
}

export async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function inspectArtifact(artifact) {
  let fileStat;
  try {
    fileStat = await stat(artifact.targetPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { exists: false, valid: false };
    }
    throw error;
  }

  const actualSha256 = await hashFile(artifact.targetPath);
  const actualSizeBytes = fileStat.size;
  const validSha256 = artifact.sha256 === undefined || artifact.sha256 === actualSha256;
  const validSize = artifact.sizeBytes === undefined || artifact.sizeBytes === actualSizeBytes;

  return {
    exists: true,
    valid: validSha256 && validSize,
    actualSha256,
    actualSizeBytes
  };
}

async function downloadArtifact(url, targetPath, options = {}) {
  if (url.protocol === "file:") {
    options.onProgress?.({
      transferredBytes: 0,
      totalBytes: options.expectedSizeBytes,
      percent: 0
    });
    await copyFile(fileURLToPath(url), targetPath);
    const sizeBytes = (await stat(targetPath)).size;
    options.onProgress?.({
      transferredBytes: sizeBytes,
      totalBytes: options.expectedSizeBytes ?? sizeBytes,
      percent: 1
    });
    return {
      sha256: await hashFile(targetPath),
      sizeBytes
    };
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation is available for model downloads.");
  }

  const response = await fetchImpl(url.href);
  if (!response.ok) {
    throw new Error(`Download failed for ${url.href}: HTTP ${response.status}.`);
  }
  if (!response.body) {
    const data = Buffer.from(await response.arrayBuffer());
    const totalBytes = parseContentLength(response.headers.get("content-length"))
      ?? options.expectedSizeBytes
      ?? data.length;
    options.onProgress?.({
      transferredBytes: data.length,
      totalBytes,
      percent: totalBytes > 0 ? Math.min(data.length / totalBytes, 1) : undefined
    });
    await writeFile(targetPath, data);
    return {
      sha256: await hashFile(targetPath),
      sizeBytes: data.length
    };
  }

  const hash = createHash("sha256");
  let sizeBytes = 0;
  const totalBytes = parseContentLength(response.headers.get("content-length"))
    ?? options.expectedSizeBytes;
  options.onProgress?.({
    transferredBytes: 0,
    totalBytes,
    percent: totalBytes === undefined ? undefined : 0
  });
  const hasher = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      sizeBytes += chunk.length;
      options.onProgress?.({
        transferredBytes: sizeBytes,
        totalBytes,
        percent: totalBytes === undefined ? undefined : Math.min(sizeBytes / totalBytes, 1)
      });
      callback(null, chunk);
    }
  });

  const readable = typeof response.body.getReader === "function"
    ? Readable.fromWeb(response.body)
    : response.body;
  await pipeline(readable, hasher, createWriteStream(targetPath));

  return {
    sha256: hash.digest("hex"),
    sizeBytes
  };
}

function parseContentLength(value) {
  if (!value) {
    return undefined;
  }
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function assertInside(root, target, name) {
  const rootWithSeparator = root.endsWith(sep) ? root : `${root}${sep}`;
  if (target !== root && !target.startsWith(rootWithSeparator)) {
    throw new Error(`${name} must stay inside ${root}.`);
  }
}
