const assert = require("assert");
const fs = require("fs");
const path = require("path");

function run() {
  const html = fs.readFileSync(path.join(process.cwd(), "apps/v9/index.html"), "utf8");
  const css = fs.readFileSync(path.join(process.cwd(), "apps/v9/styles.css"), "utf8");
  const appJs = fs.readFileSync(path.join(process.cwd(), "apps/v9/app.js"), "utf8");

  assert.ok(html.includes('href="./styles.css"'), "v9 index should load styles.css");
  assert.ok(html.includes('src="./app.js"'), "v9 index should load app.js");
  assert.ok(html.includes('src="./lib/discount-utils.js"'), "v9 index should load discount utils");
  assert.ok(html.includes('src="runtime-config.js"'), "v9 index should load runtime-config.js");
  assert.ok(!html.includes('id="discount"'), "global discount input should be removed");
  assert.ok(html.includes('id="discountStep"'), "step input should be present");
  assert.ok(html.includes('data-step="0.01"'), "step presets should include 0.01");
  assert.ok(html.includes('data-step="0.5"'), "step presets should include 0.5");
  assert.ok(html.includes('id="btnRegexConvert"'), "regex convert button should remain");
  assert.ok(appJs.includes("loadRemotePriceFromManifest"), "app should keep remote price manifest loading");
  assert.ok(appJs.includes("loadStockBundleByScript"), "app should keep dynamic stock loading");
  assert.ok(appJs.includes("ensureDataLoaded"), "app should initialize remote data load at startup");
  assert.ok(appJs.includes("getDefaultDiscountPreset"), "app should use default discount rules");
  assert.ok(appJs.includes("discountPercent"), "row state should keep ui-facing discount percent");
  assert.ok(appJs.includes("adjustRowDiscount"), "app should expose row discount stepper logic");
  assert.ok(appJs.includes("findMatchesByRegex"), "app should unify smart search and inventory search");
  assert.ok(!appJs.includes('name: item.n || ""'), "row state should no longer depend on name");
  assert.ok(appJs.includes('n: item.n || ""'), "price name field should flow into merged DB");
  assert.ok(appJs.includes('m: item.m || ""'), "price mnemonic field should flow into merged DB");
  assert.ok(appJs.includes('a: item.a || ""'), "price alias field should flow into merged DB");
  assert.ok(appJs.includes("HOLD_START_DELAY_MS"), "app should include long-press delay");
  assert.ok(appJs.includes("startDiscountPress"), "app should include long-press start handler");
  assert.ok(appJs.includes("handleGlobalPointerUp"), "app should include long-press release handler");
  assert.ok(appJs.includes('colspan="3"'), "metadata row should span the non-checkbox columns");
  assert.ok(appJs.includes('rowspan="2"'), "checkbox should span both display rows");
  assert.ok(css.includes(".discount-stepper"), "styles should include row discount stepper");
  assert.ok(css.includes(".discount-stepper-btn.is-pressing"), "styles should include pressed button state");
  assert.ok(css.includes(".price.is-flashing"), "styles should include price flash state");
  assert.ok(css.includes(".toolbar"), "styles should include sticky toolbar");
  assert.ok(css.includes(".results-shell"), "styles should include result workspace shell");
  assert.ok(html.includes('class="result-count"'), "result count badge should be present");
  assert.ok(html.includes('class="query-note"'), "query panel should include rule note");
  assert.ok(!html.includes("名称"), "page copy should no longer reference name");
  assert.ok(!appJs.includes("onRowDiscountChange"), "legacy row text input handler should be removed");
  assert.ok(!html.includes('class="discount-input"'), "legacy discount input should be removed");
}

try {
  run();
  console.log("v9-load-smoke: OK");
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
