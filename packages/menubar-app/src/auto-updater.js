import { createWriteStream } from "node:fs";
import { stat, unlink, rename } from "node:fs/promises";
import { get } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

const GITHUB_API_HOST = "api.github.com";
const REPO_PATH = "/repos/jiangnanquan/SanchoAiIME/releases/latest";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function createAutoUpdater(options = {}) {
  return new AutoUpdater(options);
}

class AutoUpdater {
  constructor(options = {}) {
    this.currentVersion = options.currentVersion ?? "0.0.0";
    this.onUpdateAvailable = options.onUpdateAvailable ?? (() => {});
    this.onNoUpdate = options.onNoUpdate ?? (() => {});
    this.onDownloadProgress = options.onDownloadProgress ?? (() => {});
    this.onDownloadComplete = options.onDownloadComplete ?? (() => {});
    this.onError = options.onError ?? (() => {});
    this.latestRelease = undefined;
    this.downloadedPath = undefined;
    this.checkTimer = undefined;
  }

  async checkForUpdates() {
    try {
      const release = await fetchLatestRelease();
      if (!release) {
        this.onNoUpdate("Unable to fetch release info");
        return;
      }
      this.latestRelease = release;
      const latestVersion = parseTagVersion(release.tag_name);
      const current = parseVersion(this.currentVersion);
      if (!latestVersion || compareVersions(latestVersion, current) <= 0) {
        this.onNoUpdate("Already up to date");
        return;
      }
      const dmgAsset = release.assets.find(
        (asset) =>
          asset.name.endsWith(".dmg") &&
          asset.content_type === "application/x-apple-diskimage"
      );
      if (!dmgAsset) {
        this.onNoUpdate("No DMG asset found in release");
        return;
      }
      this.onUpdateAvailable({
        version: release.tag_name,
        name: release.name ?? release.tag_name,
        notes: release.body ?? "",
        url: dmgAsset.browser_download_url,
        size: dmgAsset.size
      });
    } catch (error) {
      this.onError(error);
    }
  }

  async downloadUpdate(options = {}) {
    const url = options.url ?? this.latestRelease?.assets?.find(
      (a) => a.name.endsWith(".dmg")
    )?.browser_download_url;

    if (!url) {
      throw new Error("No download URL available");
    }

    const destDir = options.destDir ?? tmpdir();
    const fileName = `SanchoAiIME-${this.latestRelease?.tag_name ?? "update"}.dmg`;
    const destPath = join(destDir, fileName);
    const tmpPath = `${destPath}.${Date.now()}.tmp`;

    await downloadFile(url, tmpPath, (progress) => {
      this.onDownloadProgress(progress);
    });

    await rename(tmpPath, destPath);

    if (this.downloadedPath && this.downloadedPath !== destPath) {
      await unlink(this.downloadedPath).catch(() => {});
    }
    this.downloadedPath = destPath;

    this.onDownloadComplete(destPath);
    return destPath;
  }

  startPeriodicCheck() {
    this.stopPeriodicCheck();
    this.checkTimer = setInterval(() => {
      void this.checkForUpdates();
    }, CHECK_INTERVAL_MS);
  }

  stopPeriodicCheck() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
  }
}

export function parseTagVersion(tagName) {
  const match = String(tagName ?? "").match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function parseVersion(version) {
  return parseTagVersion(version) ?? { major: 0, minor: 0, patch: 0 };
}

function compareVersions(a, b) {
  if (a.major !== b.major) {
    return a.major - b.major;
  }
  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }
  return a.patch - b.patch;
}

async function fetchLatestRelease() {
  return await new Promise((resolve, reject) => {
    const req = get(
      {
        hostname: GITHUB_API_HOST,
        path: REPO_PATH,
        headers: {
          "Accept": "application/vnd.github+json",
          "User-Agent": "SanchoAiIME-auto-updater",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      },
      (res) => {
        if (res.statusCode === 304 || res.statusCode === 404) {
          resolve(null);
          return;
        }
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

async function downloadFile(url, destPath, onProgress) {
  return await new Promise((resolve, reject) => {
    const req = get(
      url,
      {
        headers: {
          "Accept": "application/octet-stream",
          "User-Agent": "SanchoAiIME-auto-updater"
        }
      },
      (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          req.destroy();
          downloadFile(res.headers.location, destPath, onProgress)
            .then(resolve, reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`Download failed with status ${res.statusCode}`));
          return;
        }

        const totalSize = Number(res.headers["content-length"] ?? 0);
        let downloaded = 0;

        const writeStream = createWriteStream(destPath);
        res.on("data", (chunk) => {
          downloaded += chunk.length;
          if (totalSize > 0) {
            onProgress({ downloaded, total: totalSize, percent: Math.round((downloaded / totalSize) * 100) });
          }
        });

        pipeline(res, writeStream).then(resolve, reject);
      }
    );

    req.on("error", reject);
    req.setTimeout(600000, () => {
      req.destroy();
      reject(new Error("Download timed out after 10 minutes"));
    });
    req.end();
  });
}
