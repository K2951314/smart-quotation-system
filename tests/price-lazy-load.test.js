const assert = require("assert");
const fs = require("fs");
const path = require("path");

function run() {
  const html = fs.readFileSync(path.join(process.cwd(), "apps/v9/index.html"), "utf8");
  assert.ok(html.includes("window.onload = async function()"), "page should bootstrap remote data on load");
  assert.ok(html.includes("await ensureDataLoaded()"), "window.onload should await full remote data loading");
  assert.ok(
    html.includes("Promise.all([") && html.includes("loadRemotePriceFromManifest") && html.includes("loadRemoteStockBundle"),
    "init path should load both remote price and remote stock"
  );
  assert.ok(!html.includes("ensurePriceLoaded"), "should not lazy load price on first query anymore");
}

try {
  run();
  console.log("price-lazy-load: OK");
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
