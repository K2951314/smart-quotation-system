const assert = require("assert");
const fs = require("fs");
const path = require("path");

function run() {
  const html = fs.readFileSync(path.join(process.cwd(), "apps/v9/index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(process.cwd(), "apps/v9/app.js"), "utf8");
  const runtimeConfig = fs.readFileSync(path.join(process.cwd(), "apps/v9/runtime-config.js"), "utf8");

  assert.ok(appJs.includes("loadRemotePriceFromManifest"), "should include remote price manifest loader");
  assert.ok(!appJs.includes("loadLocalPriceFallback"), "remote-only mode should remove local price fallback");
  assert.ok(!html.includes("price.bundle.js"), "remote-only mode should not reference local price bundle");
  assert.ok(appJs.includes('setStatus("远程数据加载失败"'), "page should show explicit remote-only load failure");

  assert.ok(runtimeConfig.includes("remotePrice"), "runtime config should define remotePrice section");
  assert.ok(runtimeConfig.includes("price-manifest.json"), "remotePrice should point to manifest URL");
}

try {
  run();
  console.log("price-remote-fallback: OK");
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
