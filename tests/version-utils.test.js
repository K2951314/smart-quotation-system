const test = require("node:test");
const assert = require("node:assert/strict");

const VersionUtils = require("../apps/v9/lib/version-utils.js");

test("价格版本优先取manifest.updated_at", () => {
  const version = VersionUtils.pickPriceVersion({
    manifestMeta: { updated_at: "2026-04-03T10:00:00.000Z" },
    bundleMeta: {
      generated_at: "2026-04-02T10:00:00.000Z",
      version: "2026-04-01T10:00:00.000Z",
    },
  });

  assert.equal(version, "2026-04-03T10:00:00.000Z");
});

test("库存版本按generated_at再回退version", () => {
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
