const assert = require("assert");
const fs = require("fs");
const path = require("path");

function run() {
  const html = fs.readFileSync(path.join(process.cwd(), "apps/v9/index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(process.cwd(), "apps/v9/app.js"), "utf8");

  assert.ok(html.includes('src="./app.js"'), "page should load the external app bootstrap");
  assert.ok(appJs.includes("window.onload = async function"), "page should bootstrap remote data on load");
  assert.ok(appJs.includes("await ensureDataLoaded()"), "window.onload should await full remote data loading");
  assert.ok(
    appJs.includes("Promise.all([") && appJs.includes("loadRemotePriceFromManifest") && appJs.includes("loadRemoteStockBundle"),
    "init path should load both remote price and remote stock"
  );
  assert.ok(!appJs.includes("ensurePriceLoaded"), "should not lazy load price on first query anymore");
}

try {
  run();
  console.log("price-lazy-load: OK");
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
