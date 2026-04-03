import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";

import { publishPriceBundle } from "../tools/publish_price_bundle.mjs";

test("publishPriceBundle 生成 manifest 时包含 updated_at", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "price-publish-"));
  const input = path.join(dir, "price.bundle.js");
  const outputRoot = path.join(dir, "apps", "v9");

  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    input,
    "window.PRICE_BUNDLE = {\"secured\":false,\"payload\":\"\",\"meta\":{\"version\":\"2026-04-03T00:00:00.000Z\"}};\n",
    "utf8",
  );

  await publishPriceBundle({ input, outputRoot });

  const manifest = JSON.parse(
    await readFile(path.join(outputRoot, "price-manifest.json"), "utf8"),
  );

  assert.ok(manifest.updated_at);
});
