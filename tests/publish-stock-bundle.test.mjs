import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";

import { publishStockBundle } from "../tools/publish_stock_bundle.mjs";

test("publishStockBundle creates stock-manifest and refreshes updated_at", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "stock-publish-"));
  const input = path.join(dir, "stock.bundle.js");
  const outputRoot = path.join(dir, "apps", "v9");

  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    input,
    "window.STOCK_BUNDLE = {\"secured\":false,\"payload\":\"\",\"meta\":{\"generated_at\":\"2026-04-03T00:00:00.000Z\"}};\n",
    "utf8",
  );

  await publishStockBundle({
    input,
    outputRoot,
    now: "2026-04-03T00:00:00.000Z",
  });
  await publishStockBundle({
    input,
    outputRoot,
    now: "2026-04-03T02:00:00.000Z",
  });

  const manifest = JSON.parse(
    await readFile(path.join(outputRoot, "stock-manifest.json"), "utf8"),
  );

  assert.equal(manifest.latest, "stock.bundle.js");
  assert.equal(manifest.updated_at, "2026-04-03T02:00:00.000Z");
  assert.equal(manifest.content_updated_at, "2026-04-03T00:00:00.000Z");
});
