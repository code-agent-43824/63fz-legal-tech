import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BoundedMemoryCache,
  getPublicReaderCacheMarker,
  invalidatePublicReaderCache,
  resolveReaderCacheMarkerFile,
} from "../src/lib/reader-cache";
import {
  getSafeReaderDataCacheFallback,
  resolveReaderVersionCacheKey,
  type ReaderData,
} from "../src/lib/law-data";

test("public reader cache marker starts empty and updates on invalidation", async () => {
  const previousMarkerFile = process.env.READER_SNAPSHOT_MARKER_FILE;
  const tempDir = await mkdtemp(path.join(tmpdir(), "63fz-reader-cache-"));
  process.env.READER_SNAPSHOT_MARKER_FILE = path.join(tempDir, "marker");

  try {
    assert.equal(await getPublicReaderCacheMarker(), 0);

    await invalidatePublicReaderCache();

    assert.ok((await getPublicReaderCacheMarker()) > 0);
  } finally {
    restoreEnv("READER_SNAPSHOT_MARKER_FILE", previousMarkerFile);
    await rm(tempDir, { force: true, recursive: true });
  }
});

test("reader cache marker accepts an isolated file inside the system temp directory", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "63fz-reader-cache-"));

  try {
    const markerFile = path.join(tempDir, "nested", "marker");
    assert.equal(resolveReaderCacheMarkerFile(markerFile), markerFile);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test("reader cache marker rejects traversal and sibling-prefix paths", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "63fz-reader-cache-"));

  try {
    assert.equal(
      resolveReaderCacheMarkerFile(path.join(tempDir, "..", "..", "..", "etc", "outside-marker")),
      "/tmp/63fz-legal-tech-reader-cache.invalidate",
    );
    assert.equal(
      resolveReaderCacheMarkerFile("/tmp-other/marker"),
      "/tmp/63fz-legal-tech-reader-cache.invalidate",
    );
    assert.equal(
      resolveReaderCacheMarkerFile(tmpdir()),
      "/tmp/63fz-legal-tech-reader-cache.invalidate",
    );
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test("invalid requested reader versions normalize to the current version cache key", () => {
  const versionIds = ["current-version", "previous-version"];

  assert.equal(
    resolveReaderVersionCacheKey({
      currentVersionId: "current-version",
      requestedVersionId: "missing-a",
      versionIds,
    }),
    "current-version",
  );
  assert.equal(
    resolveReaderVersionCacheKey({
      currentVersionId: "current-version",
      requestedVersionId: "missing-b",
      versionIds,
    }),
    "current-version",
  );
  assert.equal(
    resolveReaderVersionCacheKey({
      currentVersionId: "current-version",
      versionIds,
    }),
    "current-version",
  );
});

test("real requested reader versions keep separate cache keys", () => {
  const versionIds = ["current-version", "previous-version"];

  assert.equal(
    resolveReaderVersionCacheKey({
      currentVersionId: "current-version",
      requestedVersionId: "current-version",
      versionIds,
    }),
    "current-version",
  );
  assert.equal(
    resolveReaderVersionCacheKey({
      currentVersionId: "current-version",
      requestedVersionId: "previous-version",
      versionIds,
    }),
    "previous-version",
  );
});

test("bounded reader cache does not exceed its configured size", () => {
  const cache = new BoundedMemoryCache<number>(3);

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  cache.set("d", 4);

  assert.deepEqual(cache.state(), {
    keys: ["b", "c", "d"],
    size: 3,
  });

  assert.equal(cache.get("b"), 2);
  cache.set("e", 5);

  assert.deepEqual(cache.state(), {
    keys: ["d", "b", "e"],
    size: 3,
  });
});

test("safe reader fallback returns only an exact-key cached reader snapshot", () => {
  const current = readerData("current");
  const previous = readerData("previous");
  const cache = new BoundedMemoryCache<{ data: ReaderData; marker: number }>(3);

  cache.set("current", { data: current, marker: 1 });
  cache.set("previous", { data: previous, marker: 1 });

  assert.equal(
    getSafeReaderDataCacheFallback({
      cacheKey: "current",
      cached: cache.get("current"),
      marker: 1,
    }),
    current,
  );
  assert.equal(
    getSafeReaderDataCacheFallback({
      cacheKey: "missing",
      cached: cache.get("missing"),
      marker: 1,
    }),
    null,
  );
});

test("safe reader fallback rejects unknown selection and stale marker snapshots", () => {
  const current = readerData("current");

  assert.equal(
    getSafeReaderDataCacheFallback({
      cacheKey: null,
      cached: { data: current, marker: 1 },
      marker: 1,
    }),
    null,
  );
  assert.equal(
    getSafeReaderDataCacheFallback({
      cacheKey: "current",
      cached: { data: current, marker: 1 },
      marker: 2,
    }),
    null,
  );
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function readerData(selectedVersionId: string): ReaderData {
  return {
    isDemo: false,
    versions: [],
    selectedVersionId,
    currentVersionId: "current",
    selectedVersionLabel: selectedVersionId,
    toc: [],
    fragments: [],
    changeSummary: {
      introduced: 0,
      unchanged: 0,
      changed: 0,
      deleted: 0,
    },
  };
}
