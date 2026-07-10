import { mkdir, stat, writeFile } from "node:fs/promises";

const DEFAULT_MARKER_FILE = "/tmp/63fz-legal-tech-reader-cache.invalidate";

export async function getPublicReaderCacheMarker() {
  try {
    const marker = await stat(getMarkerFile());
    return marker.mtimeMs;
  } catch {
    return 0;
  }
}

export async function invalidatePublicReaderCache() {
  const markerFile = getMarkerFile();
  const markerDirectory = getDirectoryName(markerFile);
  if (markerDirectory) {
    await mkdir(markerDirectory, { recursive: true });
  }
  await writeFile(markerFile, String(Date.now()));
}

function getMarkerFile() {
  return process.env.READER_SNAPSHOT_MARKER_FILE || DEFAULT_MARKER_FILE;
}

function getDirectoryName(filePath: string) {
  const lastSlashIndex = filePath.lastIndexOf("/");
  return lastSlashIndex > 0 ? filePath.slice(0, lastSlashIndex) : "";
}
