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
  assert.ok(html.includes(">库存查询<"), "v9 index should rename regex button to inventory query");
  assert.ok(!html.includes('id="stockBundleUrl"'), "v9 index should not expose stock URL input");
  assert.ok(!html.includes("applyStockSource"), "v9 index should not expose remote stock apply action");
  assert.ok(html.includes("loadStockBundleByScript"), "v9 index should include dynamic stock script loader");
  assert.ok(html.includes("ensureDataLoaded"), "v9 index should initialize remote data load at startup");
  assert.ok(!html.includes("ensurePriceLoaded"), "v9 index should not use query-time price lazy load");
  assert.ok(html.includes("loadRemotePriceFromManifest"), "v9 index should support remote price manifest loading");
  assert.ok(!html.includes("loadLocalPriceFallback"), "v9 index should not keep local price fallback");
  assert.ok(!html.includes("stock.bundle.js"), "v9 index should not keep local stock fallback");
  assert.ok(html.includes("sticky-check"), "v9 index should include sticky checkbox column");
  assert.ok(html.includes("result-meta"), "v9 index should render compact top metadata rows");
  assert.ok(html.includes("result-main"), "v9 index should render bottom data rows");
  assert.ok(html.includes("meta-line"), "v9 index should include top metadata layout");
  assert.ok(html.includes("colspan=\"4\""), "metadata row should span the four main data columns");
  assert.ok(html.includes("rowspan=\"2\""), "checkbox should span both display rows");
  assert.ok(html.includes('th class="main-header col-face">面价</th>'), "top header should keep face price only");
  assert.ok(!html.includes("<th>库存</th>"), "stock should move out of the main header row");
  assert.ok(html.includes('<th class="col-remark">备注</th>'), "main row should expose remark column");
  assert.ok(html.includes("meta-stock"), "top metadata row should expose stock summary");
  assert.ok(html.includes('class="remark"'), "remark should render on the main row");
  assert.ok(html.includes("text-overflow: ellipsis"), "remark should stay single-line with ellipsis");
  assert.ok(!html.includes("补充说明："), "copy output should not prepend remark label");
  assert.ok(!html.includes("meta-key"), "top metadata row should not render mini labels");
  assert.ok(html.includes("hasStockValue(item.i)"), "inventory query should filter rows without stock");
}

try {
  run();
  console.log("v9-load-smoke: OK");
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
