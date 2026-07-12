import { mkdir, stat, writeFile } from "node:fs/promises";

const DEFAULT_MARKER_FILE = "/tmp/63fz-legal-tech-reader-cache.invalidate";
const ALLOWED_MARKER_DIRECTORIES = ["/tmp/", "/var/tmp/"];

export const DEFAULT_READER_DATA_CACHE_LIMIT = 12;

export type BoundedCacheState = {
  keys: string[];
  size: number;
};

export class BoundedMemoryCache<T> {
  private readonly entries = new Map<string, T>();

  constructor(private readonly maxEntries = DEFAULT_READER_DATA_CACHE_LIMIT) {}

  get(key: string) {
    const value = this.entries.get(key);
    if (value === undefined) {
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: T) {
    if (this.maxEntries <= 0) {
      return;
    }

    if (this.entries.has(key)) {
      this.entries.delete(key);
    }

    this.entries.set(key, value);
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      this.entries.delete(oldestKey);
    }
  }

  clear() {
    this.entries.clear();
  }

  newestValue() {
    const values = Array.from(this.entries.values());
    return values.at(-1);
  }

  state(): BoundedCacheState {
    return {
      keys: Array.from(this.entries.keys()),
      size: this.entries.size,
    };
  }
}

export async function getPublicReaderCacheMarker() {
  try {
    const marker = await stat(/*turbopackIgnore: true*/ getMarkerFile());
    return marker.mtimeMs;
  } catch {
    return 0;
  }
}

export async function invalidatePublicReaderCache() {
  const markerFile = getMarkerFile();
  const markerDirectory = getDirectoryName(markerFile);
  if (markerDirectory) {
    await mkdir(/*turbopackIgnore: true*/ markerDirectory, { recursive: true });
  }
  await writeFile(/*turbopackIgnore: true*/ markerFile, String(Date.now()));
}

function getMarkerFile() {
  const configured = process.env.READER_SNAPSHOT_MARKER_FILE;
  if (!configured) {
    return DEFAULT_MARKER_FILE;
  }

  if (ALLOWED_MARKER_DIRECTORIES.some((directory) => configured.startsWith(directory))) {
    return configured;
  }

  return DEFAULT_MARKER_FILE;
}

function getDirectoryName(filePath: string) {
  const lastSlashIndex = filePath.lastIndexOf("/");
  return lastSlashIndex > 0 ? filePath.slice(0, lastSlashIndex) : "";
}
