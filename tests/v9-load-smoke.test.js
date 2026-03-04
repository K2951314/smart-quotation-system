const assert = require("assert");
const fs = require("fs");
const path = require("path");

function run() {
  const html = fs.readFileSync(path.join(process.cwd(), "apps/v9/index.html"), "utf8");
  assert.ok(html.includes('src="runtime-config.js"'), "v9 index should load runtime-config.js");
  assert.ok(!html.includes('src="price.bundle.js"'), "v9 index should not eagerly load price bundle");
  assert.ok(!html.includes('src="stock.bundle.js"'), "v9 index should not eagerly load local stock bundle");
  assert.ok(
    !html.includes("data-utils.js"),
    "v9 index should not depend on data-utils.js after local-stock-only simplification"
  );
  assert.ok(html.includes('src="./lib/query-regex.js"'), "v9 index should load query-regex helper");
  assert.ok(html.includes('id="btnRegexConvert"'), "v9 index should expose regex convert button");
  assert.ok(html.includes("doRegexSearchConverted"), "v9 index should include regex convert search handler");
  assert.ok(!html.includes('id="stockBundleUrl"'), "v9 index should not expose stock URL input");
  assert.ok(!html.includes("applyStockSource"), "v9 index should not expose remote stock apply action");
  assert.ok(html.includes("loadStockBundleByScript"), "v9 index should include dynamic stock script loader");
  assert.ok(html.includes("ensureDataLoaded"), "v9 index should initialize remote data load at startup");
  assert.ok(!html.includes("ensurePriceLoaded"), "v9 index should not use query-time price lazy load");
  assert.ok(html.includes("loadRemotePriceFromManifest"), "v9 index should support remote price manifest loading");
  assert.ok(!html.includes("loadLocalPriceFallback"), "v9 index should not keep local price fallback");
  assert.ok(!html.includes("stock.bundle.js"), "v9 index should not keep local stock fallback");
}

try {
  run();
  console.log("v9-load-smoke: OK");
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
