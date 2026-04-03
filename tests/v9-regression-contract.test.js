const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, "..", relPath), "utf8");
}

test("app version bar keeps Chinese text and stock manifest priority", () => {
  const source = read("apps/v9/app.js");

  assert.match(
    source,
    /VersionEngine\.pickStockVersion\(\s*\{\s*manifestMeta:\s*STOCK_MANIFEST_META,\s*bundleMeta:\s*STOCK_META\s*\}\s*\)/s,
  );
  assert.match(
    source,
    /"价格版本: "\s*\+\s*priceVersion\s*\+\s*" \| 库存版本: "\s*\+\s*stockVersion/,
  );
  assert.doesNotMatch(source, /浠锋牸|搴撳瓨/);
});

test("runtime config points remote sources to raw github for freshness and large bundle access", () => {
  const source = read("apps/v9/runtime-config.js");

  assert.match(
    source,
    /manifestUrl:\s*"https:\/\/raw\.githubusercontent\.com\/K2951314\/-\/stock-data\/apps\/v9\/price-manifest\.json"/,
  );
  assert.match(
    source,
    /manifestUrl:\s*"https:\/\/raw\.githubusercontent\.com\/K2951314\/-\/stock-data\/apps\/v9\/stock-manifest\.json"/,
  );
  assert.match(
    source,
    /url:\s*"https:\/\/raw\.githubusercontent\.com\/K2951314\/-\/stock-data\/apps\/v9\/stock\.bundle\.js"/,
  );
  assert.match(
    source,
    /url:\s*"https:\/\/raw\.githubusercontent\.com\/K2951314\/-\/main\/apps\/v9\/default-discount\.json"/,
  );
});

test("toolbar keeps requested button order and equal-width control columns", () => {
  const html = read("apps/v9/index.html");
  const css = read("apps/v9/styles.css");
  const actionLabels = Array.from(
    html.matchAll(/<button\b[^>]*>([^<]+)<\/button>/g),
    (match) => match[1].trim(),
  ).slice(0, 4);

  assert.deepEqual(actionLabels, ["智能查询", "库存查询", "三菱库存", "复制勾选"]);
  assert.match(
    css,
    /\.toolbar-actions\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s,
  );
  assert.match(
    css,
    /\.toolbar-main\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s,
  );
  assert.match(
    css,
    /\.toolbar-secondary-main\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s,
  );
  assert.match(
    css,
    /\.toolbar-result-actions\s*\{[^}]*grid-column:\s*2\s*;[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s,
  );
  assert.match(
    css,
    /\.toolbar-copy-inline\s*\{[^}]*grid-column:\s*3\s*;/s,
  );
});

test("mobile version bar stays on one line and scrolls horizontally", () => {
  const css = read("apps/v9/styles.css");

  assert.match(
    css,
    /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\.version-bar\s*\{[\s\S]*?overflow-x:\s*auto;[\s\S]*?white-space:\s*nowrap;/,
  );
});
