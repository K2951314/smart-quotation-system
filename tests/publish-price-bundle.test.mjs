import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";

import { publishPriceBundle } from "../tools/publish_price_bundle.mjs";

test("publishPriceBundle writes updated_at into price-manifest", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "price-publish-"));
  const input = path.join(dir, "price.bundle.js");
  const outputRoot = path.join(dir, "apps", "v9");

  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    input,
    "window.PRICE_BUNDLE = {\"secured\":false,\"payload\":\"\",\"meta\":{\"version\":\"2026-04-03T00:00:00.000Z\"}};\n",
    "utf8",
  );

  await publishPriceBundle({ input, outputRoot, now: "2026-04-03T00:00:00.000Z" });

  const manifest = JSON.parse(
    await readFile(path.join(outputRoot, "price-manifest.json"), "utf8"),
  );

  assert.equal(manifest.updated_at, "2026-04-03T00:00:00.000Z");
  assert.equal(manifest.content_updated_at, "2026-04-03T00:00:00.000Z");
});

test("publishPriceBundle refreshes updated_at even when bundle bytes are unchanged", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "price-publish-refresh-"));
  const input = path.join(dir, "price.bundle.js");
  const outputRoot = path.join(dir, "apps", "v9");

  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    input,
    "window.PRICE_BUNDLE = {\"secured\":false,\"payload\":\"\",\"meta\":{\"version\":\"2026-04-03T00:00:00.000Z\"}};\n",
    "utf8",
  );

  await publishPriceBundle({
    input,
    outputRoot,
    now: "2026-04-03T00:00:00.000Z",
  });
  await publishPriceBundle({
    input,
    outputRoot,
    now: "2026-04-03T01:00:00.000Z",
  });

  const manifest = JSON.parse(
    await readFile(path.join(outputRoot, "price-manifest.json"), "utf8"),
  );

  assert.equal(manifest.updated_at, "2026-04-03T01:00:00.000Z");
  assert.equal(manifest.content_updated_at, "2026-04-03T00:00:00.000Z");
});
