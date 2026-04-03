const test = require("node:test");
const assert = require("node:assert/strict");

const RemoteSourceUtils = require("../apps/v9/lib/remote-source-utils.js");

test("buildCacheBustUrl supports request mode with millisecond precision", () => {
  const url = RemoteSourceUtils.buildCacheBustUrl(
    "https://example.com/data.json",
    "request",
    "2026-04-03T07:00:01.234Z",
  );

  assert.equal(url, "https://example.com/data.json?v=1775199601234");
});

test("buildCacheBustUrl keeps hourly and daily compatibility", () => {
  assert.equal(
    RemoteSourceUtils.buildCacheBustUrl(
      "https://example.com/data.json",
      "hourly",
      "2026-04-03T07:00:01.234Z",
    ),
    "https://example.com/data.json?v=2026040307",
  );

  assert.equal(
    RemoteSourceUtils.buildCacheBustUrl(
      "https://example.com/data.json",
      "daily",
      "2026-04-03T07:00:01.234Z",
    ),
    "https://example.com/data.json?v=20260403",
  );
});

test("getBundleCandidateUrls adds raw github fallback for jsdelivr branch assets", () => {
  const urls = RemoteSourceUtils.getBundleCandidateUrls(
    "https://cdn.jsdelivr.net/gh/K2951314/-@stock-data/apps/v9/price/price.06115dbf95cf.bundle.js",
  );

  assert.deepEqual(urls, [
    "https://cdn.jsdelivr.net/gh/K2951314/-@stock-data/apps/v9/price/price.06115dbf95cf.bundle.js",
    "https://raw.githubusercontent.com/K2951314/-/stock-data/apps/v9/price/price.06115dbf95cf.bundle.js",
  ]);
});

test("getBundleCandidateUrls leaves non-jsdelivr urls unchanged", () => {
  const urls = RemoteSourceUtils.getBundleCandidateUrls(
    "https://raw.githubusercontent.com/K2951314/-/stock-data/apps/v9/price/price.06115dbf95cf.bundle.js",
  );

  assert.deepEqual(urls, [
    "https://raw.githubusercontent.com/K2951314/-/stock-data/apps/v9/price/price.06115dbf95cf.bundle.js",
  ]);
});

test("getFetchCandidateUrls prefers raw github for manifest fetches", () => {
  const urls = RemoteSourceUtils.getFetchCandidateUrls(
    "https://cdn.jsdelivr.net/gh/K2951314/-@stock-data/apps/v9/price-manifest.json",
    { prefer: "raw", includeJsDelivr: true },
  );

  assert.deepEqual(urls, [
    "https://raw.githubusercontent.com/K2951314/-/stock-data/apps/v9/price-manifest.json",
    "https://cdn.jsdelivr.net/gh/K2951314/-@stock-data/apps/v9/price-manifest.json",
  ]);
});

test("getFetchCandidateUrls keeps raw primary and adds jsdelivr fallback when requested", () => {
  const urls = RemoteSourceUtils.getFetchCandidateUrls(
    "https://raw.githubusercontent.com/K2951314/-/stock-data/apps/v9/stock.bundle.js",
    { prefer: "raw", includeJsDelivr: true },
  );

  assert.deepEqual(urls, [
    "https://raw.githubusercontent.com/K2951314/-/stock-data/apps/v9/stock.bundle.js",
    "https://cdn.jsdelivr.net/gh/K2951314/-@stock-data/apps/v9/stock.bundle.js",
  ]);
});
