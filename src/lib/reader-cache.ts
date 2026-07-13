import { mkdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const DEFAULT_MARKER_FILE = "/tmp/63fz-legal-tech-reader-cache.invalidate";

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
  return resolveReaderCacheMarkerFile(process.env.READER_SNAPSHOT_MARKER_FILE);
}

function getDirectoryName(filePath: string) {
  return path.dirname(filePath);
}

export function resolveReaderCacheMarkerFile(configured?: string | null) {
  if (!configured) {
    return DEFAULT_MARKER_FILE;
  }

  const markerFile = path.resolve(/*turbopackIgnore: true*/ configured);
  if (isAllowedMarkerFile(markerFile)) {
    return markerFile;
  }

  return DEFAULT_MARKER_FILE;
}

function isAllowedMarkerFile(markerFile: string) {
  return getAllowedMarkerDirectories().some((directory) => {
    const relative = path.relative(directory, markerFile);
    return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
}

function getAllowedMarkerDirectories() {
  return Array.from(
    new Set(
      ["/tmp", "/var/tmp", tmpdir()].map((directory) =>
        path.resolve(/*turbopackIgnore: true*/ directory),
      ),
    ),
  );
}
