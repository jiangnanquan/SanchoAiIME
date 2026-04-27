import { constants } from "node:fs";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, posix, resolve, sep } from "node:path";

import { hashFile, resolveModelLayout } from "./bootstrap.js";

const SNAPSHOT_SCHEMA_VERSION = 1;
const SNAPSHOT_ROOT = ".sancho-maintenance/snapshots";

export async function auditModelRuntime(manifestInput, options = {}) {
  const layout = resolveModelLayout(manifestInput, options);
  const findings = [];
  const artifacts = [];

  for (const artifact of layout.artifacts) {
    const report = await inspectExpectedArtifact(artifact);
    artifacts.push(report);
    if (report.status !== "ok") {
      findings.push({
        code: `artifact-${report.status}`,
        severity: "error",
        path: artifact.path,
        message: `Artifact ${artifact.path} is ${report.status}.`
      });
    }
  }

  const lock = await inspectLock(layout.lockPath);
  if (lock.status !== "ok") {
    findings.push({
      code: `lock-${lock.status}`,
      severity: lock.status === "missing" ? "warning" : "error",
      path: "sancho-model.lock.json",
      message: `Model lock is ${lock.status}.`
    });
  }

  const expectedPaths = new Set([
    ...layout.artifacts.map((artifact) => artifact.path),
    "sancho-model.lock.json"
  ]);
  const unexpectedFiles = await listUnexpectedFiles(layout.modelDir, expectedPaths);
  for (const file of unexpectedFiles) {
    findings.push({
      code: "unmanaged-file",
      severity: "info",
      path: file.path,
      message: `Unmanaged runtime file is present: ${file.path}.`
    });
  }

  const issueCount = findings.filter((finding) => finding.severity !== "info").length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    model: modelSummary(layout),
    modelsDir: layout.modelsDir,
    modelDir: layout.modelDir,
    lockPath: layout.lockPath,
    summary: {
      status: issueCount === 0 ? "ok" : "attention",
      artifactCount: artifacts.length,
      issueCount,
      unmanagedFileCount: unexpectedFiles.length
    },
    artifacts,
    lock,
    unexpectedFiles,
    findings
  };
}

export async function createModelSnapshot(manifestInput, options = {}) {
  const layout = resolveModelLayout(manifestInput, options);
  const snapshotId = normalizeSnapshotId(options.snapshotId ?? generateSnapshotId());
  const snapshotRoot = resolveSnapshotRoot(layout, options);
  const snapshotDir = resolve(snapshotRoot, snapshotId);
  assertInside(snapshotRoot, snapshotDir, "Snapshot directory");
  const filesDir = resolve(snapshotDir, "files");

  await mkdir(filesDir, { recursive: true });

  const artifacts = [];
  for (const artifact of layout.artifacts) {
    const entry = await snapshotFile({
      sourcePath: artifact.targetPath,
      relativePath: artifact.path,
      filesDir
    });
    artifacts.push(entry);
  }

  const lock = await snapshotFile({
    sourcePath: layout.lockPath,
    relativePath: "sancho-model.lock.json",
    filesDir
  });

  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    snapshotId,
    generatedAt: new Date().toISOString(),
    model: modelSummary(layout),
    modelsDir: layout.modelsDir,
    modelDir: layout.modelDir,
    artifacts,
    lock
  };

  await writeFile(
    resolve(snapshotDir, "snapshot.json"),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8"
  );

  return {
    ...snapshot,
    snapshotDir
  };
}

export async function diffModelSnapshot(manifestInput, options = {}) {
  const layout = resolveModelLayout(manifestInput, options);
  const { snapshot, snapshotDir } = await readSnapshot(layout, options);
  assertSnapshotMatches(layout, snapshot);

  const artifactTargets = new Map(
    layout.artifacts.map((artifact) => [artifact.path, artifact.targetPath])
  );
  const artifactChanges = [];
  for (const entry of snapshot.artifacts) {
    const currentPath = artifactTargets.get(entry.path) ?? resolveArtifactPath(layout, entry.path);
    artifactChanges.push(await diffFileEntry(entry, currentPath));
  }

  for (const artifact of layout.artifacts) {
    if (snapshot.artifacts.some((entry) => entry.path === artifact.path)) {
      continue;
    }
    artifactChanges.push(await diffAddedArtifact(artifact));
  }

  const lock = await diffFileEntry(snapshot.lock, layout.lockPath);
  const changes = [
    ...artifactChanges,
    lock
  ];
  const changedCount = changes.filter((change) => change.status !== "unchanged").length;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    model: modelSummary(layout),
    modelsDir: layout.modelsDir,
    modelDir: layout.modelDir,
    snapshotId: snapshot.snapshotId,
    snapshotDir,
    summary: {
      status: changedCount === 0 ? "unchanged" : "changed",
      changedCount
    },
    artifacts: artifactChanges,
    lock
  };
}

export async function rollbackModelSnapshot(manifestInput, options = {}) {
  const layout = resolveModelLayout(manifestInput, options);
  const { snapshot, snapshotDir } = await readSnapshot(layout, options);
  assertSnapshotMatches(layout, snapshot);

  const actions = [];
  const snapshotPaths = new Set(snapshot.artifacts.map((entry) => entry.path));
  for (const entry of snapshot.artifacts) {
    actions.push(await rollbackFileEntry({
      entry,
      targetPath: resolveArtifactPath(layout, entry.path),
      snapshotDir,
      dryRun: Boolean(options.dryRun)
    }));
  }

  for (const artifact of layout.artifacts) {
    if (snapshotPaths.has(artifact.path)) {
      continue;
    }
    actions.push(await removeCurrentOnlyArtifact(artifact, Boolean(options.dryRun)));
  }

  actions.push(await rollbackFileEntry({
    entry: snapshot.lock,
    targetPath: layout.lockPath,
    snapshotDir,
    dryRun: Boolean(options.dryRun)
  }));

  const changedCount = actions.filter((action) => action.action !== "noop").length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    model: modelSummary(layout),
    modelsDir: layout.modelsDir,
    modelDir: layout.modelDir,
    snapshotId: snapshot.snapshotId,
    snapshotDir,
    dryRun: Boolean(options.dryRun),
    summary: {
      status: changedCount === 0 ? "unchanged" : "rolled-back",
      changedCount
    },
    actions
  };
}

function modelSummary(layout) {
  return {
    id: layout.manifest.id,
    name: layout.manifest.name,
    source: layout.manifest.source
  };
}

async function inspectExpectedArtifact(artifact) {
  let fileStat;
  try {
    fileStat = await stat(artifact.targetPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        path: artifact.path,
        targetPath: artifact.targetPath,
        status: "missing"
      };
    }
    throw error;
  }

  const actualSha256 = await hashFile(artifact.targetPath);
  const actualSizeBytes = fileStat.size;
  const expectedSha256 = artifact.sha256;
  const expectedSizeBytes = artifact.sizeBytes;
  const shaMatches = expectedSha256 === undefined || expectedSha256 === actualSha256;
  const sizeMatches = expectedSizeBytes === undefined || expectedSizeBytes === actualSizeBytes;

  return {
    path: artifact.path,
    targetPath: artifact.targetPath,
    status: shaMatches && sizeMatches ? "ok" : "changed",
    ...(expectedSha256 === undefined ? {} : { expectedSha256 }),
    actualSha256,
    ...(expectedSizeBytes === undefined ? {} : { expectedSizeBytes }),
    actualSizeBytes
  };
}

async function inspectLock(lockPath) {
  try {
    const raw = await readFile(lockPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      path: "sancho-model.lock.json",
      targetPath: lockPath,
      status: parsed && typeof parsed === "object" ? "ok" : "invalid",
      sha256: await hashFile(lockPath),
      sizeBytes: Buffer.byteLength(raw)
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        path: "sancho-model.lock.json",
        targetPath: lockPath,
        status: "missing"
      };
    }
    if (error instanceof SyntaxError) {
      return {
        path: "sancho-model.lock.json",
        targetPath: lockPath,
        status: "invalid"
      };
    }
    throw error;
  }
}

async function listUnexpectedFiles(root, expectedPaths) {
  const files = [];
  try {
    await collectFiles(root, "", files);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return files
    .filter((file) => !file.path.startsWith(`${SNAPSHOT_ROOT}/`))
    .filter((file) => !expectedPaths.has(file.path))
    .sort((left, right) => left.path.localeCompare(right.path));
}

async function collectFiles(root, prefix, files) {
  const entries = await readdir(resolve(root, prefix), { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = prefix ? posix.join(prefix, entry.name) : entry.name;
    const absolutePath = resolve(root, relativePath);
    if (entry.isDirectory()) {
      await collectFiles(root, relativePath, files);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const fileStat = await stat(absolutePath);
    files.push({
      path: relativePath,
      targetPath: absolutePath,
      sizeBytes: fileStat.size,
      sha256: await hashFile(absolutePath)
    });
  }
}

async function snapshotFile({ sourcePath, relativePath, filesDir }) {
  const entry = {
    path: relativePath,
    existed: false
  };

  try {
    const fileStat = await stat(sourcePath);
    entry.existed = true;
    entry.sha256 = await hashFile(sourcePath);
    entry.sizeBytes = fileStat.size;
    entry.snapshotPath = posix.join("files", relativePath);
    const targetPath = resolve(filesDir, relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await cloneOrCopyFile(sourcePath, targetPath);
    return entry;
  } catch (error) {
    if (error.code === "ENOENT") {
      return entry;
    }
    throw error;
  }
}

async function diffFileEntry(entry, currentPath) {
  let current;
  try {
    const fileStat = await stat(currentPath);
    current = {
      existed: true,
      sha256: await hashFile(currentPath),
      sizeBytes: fileStat.size
    };
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    current = { existed: false };
  }

  if (!entry.existed && !current.existed) {
    return {
      path: entry.path,
      targetPath: currentPath,
      status: "unchanged",
      before: { existed: false },
      after: { existed: false }
    };
  }

  if (!entry.existed && current.existed) {
    return {
      path: entry.path,
      targetPath: currentPath,
      status: "added",
      before: { existed: false },
      after: current
    };
  }

  if (entry.existed && !current.existed) {
    return {
      path: entry.path,
      targetPath: currentPath,
      status: "removed",
      before: summarizeSnapshotEntry(entry),
      after: { existed: false }
    };
  }

  const unchanged = entry.sha256 === current.sha256 && entry.sizeBytes === current.sizeBytes;
  return {
    path: entry.path,
    targetPath: currentPath,
    status: unchanged ? "unchanged" : "modified",
    before: summarizeSnapshotEntry(entry),
    after: current
  };
}

async function diffAddedArtifact(artifact) {
  try {
    const fileStat = await stat(artifact.targetPath);
    return {
      path: artifact.path,
      targetPath: artifact.targetPath,
      status: "added",
      before: { existed: false },
      after: {
        existed: true,
        sha256: await hashFile(artifact.targetPath),
        sizeBytes: fileStat.size
      }
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        path: artifact.path,
        targetPath: artifact.targetPath,
        status: "unchanged",
        before: { existed: false },
        after: { existed: false }
      };
    }
    throw error;
  }
}

async function rollbackFileEntry({ entry, targetPath, snapshotDir, dryRun }) {
  const diff = await diffFileEntry(entry, targetPath);
  if (diff.status === "unchanged") {
    return {
      path: entry.path,
      targetPath,
      action: "noop",
      status: "unchanged"
    };
  }

  if (!entry.existed) {
    if (!dryRun) {
      await rm(targetPath, { force: true });
    }
    return {
      path: entry.path,
      targetPath,
      action: "remove",
      status: diff.status
    };
  }

  if (!dryRun) {
    await mkdir(dirname(targetPath), { recursive: true });
    await cloneOrCopyFile(resolve(snapshotDir, entry.snapshotPath), targetPath);
  }
  return {
    path: entry.path,
    targetPath,
    action: "restore",
    status: diff.status
  };
}

async function removeCurrentOnlyArtifact(artifact, dryRun) {
  try {
    await stat(artifact.targetPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        path: artifact.path,
        targetPath: artifact.targetPath,
        action: "noop",
        status: "unchanged"
      };
    }
    throw error;
  }

  if (!dryRun) {
    await rm(artifact.targetPath, { force: true });
  }
  return {
    path: artifact.path,
    targetPath: artifact.targetPath,
    action: "remove",
    status: "added"
  };
}

async function readSnapshot(layout, options) {
  if (!options.snapshotId) {
    throw new Error("A snapshot id is required.");
  }
  const snapshotId = normalizeSnapshotId(options.snapshotId);
  const snapshotRoot = resolveSnapshotRoot(layout, options);
  const snapshotDir = resolve(snapshotRoot, snapshotId);
  assertInside(snapshotRoot, snapshotDir, "Snapshot directory");
  const snapshot = JSON.parse(await readFile(resolve(snapshotDir, "snapshot.json"), "utf8"));
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error("Unsupported model snapshot schema version.");
  }
  return { snapshot, snapshotDir };
}

function assertSnapshotMatches(layout, snapshot) {
  if (snapshot.model?.id !== layout.manifest.id) {
    throw new Error(
      `Snapshot model ${snapshot.model?.id ?? "<unknown>"} does not match ${layout.manifest.id}.`
    );
  }
}

function resolveSnapshotRoot(layout, options) {
  const root = resolve(options.snapshotDir ?? resolve(layout.modelDir, SNAPSHOT_ROOT));
  assertInside(layout.modelsDir, root, "Snapshot root");
  return root;
}

function resolveArtifactPath(layout, artifactPath) {
  const targetPath = resolve(layout.modelDir, artifactPath);
  assertInside(layout.modelDir, targetPath, `Artifact ${artifactPath}`);
  return targetPath;
}

function summarizeSnapshotEntry(entry) {
  return {
    existed: true,
    sha256: entry.sha256,
    sizeBytes: entry.sizeBytes
  };
}

async function cloneOrCopyFile(sourcePath, targetPath) {
  try {
    await copyFile(sourcePath, targetPath, constants.COPYFILE_FICLONE);
  } catch (error) {
    if (!["ENOSYS", "ENOTSUP", "EINVAL", "EXDEV"].includes(error.code)) {
      throw error;
    }
    await copyFile(sourcePath, targetPath);
  }
}

function generateSnapshotId() {
  return `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
}

function normalizeSnapshotId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new Error("Snapshot id must be a stable filename-safe identifier.");
  }
  return value;
}

function assertInside(root, target, name) {
  const rootWithSeparator = root.endsWith(sep) ? root : `${root}${sep}`;
  if (target !== root && !target.startsWith(rootWithSeparator)) {
    throw new Error(`${name} must stay inside ${root}.`);
  }
}
