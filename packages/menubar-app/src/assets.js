import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { nativeImage } from "electron";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = dirname(sourceDirectory);

export const appIconPath = join(packageDirectory, "assets", "icons", "icon.png");
export const trayIconPath = join(packageDirectory, "assets", "icons", "tray-icon.png");

export function createIconImage(path) {
  try {
    return nativeImage.createFromBuffer(readFileSync(path));
  } catch {
    return nativeImage.createEmpty();
  }
}

export function createTrayIcon() {
  const image = createIconImage(trayIconPath);
  if (image.isEmpty()) {
    return image;
  }
  const trayImage = image.resize({
    width: 18,
    height: 18,
    quality: "best"
  });
  trayImage.setTemplateImage(false);
  return trayImage;
}
