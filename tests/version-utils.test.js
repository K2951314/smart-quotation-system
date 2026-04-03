const test = require("node:test");
const assert = require("node:assert/strict");

const VersionUtils = require("../apps/v9/lib/version-utils.js");

test("price version prefers manifest updated_at", () => {
  const version = VersionUtils.pickPriceVersion({
    manifestMeta: { updated_at: "2026-04-03T10:00:00.000Z" },
    bundleMeta: {
      generated_at: "2026-04-02T10:00:00.000Z",
      version: "2026-04-01T10:00:00.000Z",
    },
  });

  assert.equal(version, "2026-04-03T10:00:00.000Z");
});

test("stock version falls back to bundle timestamps when no manifest exists", () => {
  assert.equal(
    VersionUtils.pickStockVersion({
      generated_at: "2026-04-03T08:00:00.000Z",
      version: "2026-04-01T08:00:00.000Z",
    }),
    "2026-04-03T08:00:00.000Z",
  );

  assert.equal(
    VersionUtils.pickStockVersion({
      version: "2026-04-01T08:00:00.000Z",
    }),
    "2026-04-01T08:00:00.000Z",
  );
});

test("stock version prefers manifest updated_at when available", () => {
  assert.equal(
    VersionUtils.pickStockVersion({
      manifestMeta: { updated_at: "2026-04-03T11:00:00.000Z" },
      bundleMeta: {
        generated_at: "2026-04-03T08:00:00.000Z",
        version: "2026-04-01T08:00:00.000Z",
      },
    }),
    "2026-04-03T11:00:00.000Z",
  );
});
