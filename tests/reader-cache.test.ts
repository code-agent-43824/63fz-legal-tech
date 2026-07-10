import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  getPublicReaderCacheMarker,
  invalidatePublicReaderCache,
} from "../src/lib/reader-cache";

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

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
