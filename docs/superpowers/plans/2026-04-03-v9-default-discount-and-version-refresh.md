# V9 Default Discount And Version Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 调整 v9 工具栏布局，新增 GitHub 远程默认折扣配置，修复价格版本刷新显示，并同步 README。

**Architecture:** 保持 `apps/v9` 为当前 Netlify 发布根目录，不做单文件化。新增一个远程默认折扣配置入口并在前端做“本地优先、远程兜底、内置兜底”的合并；价格版本改为优先显示价格 manifest 的 `updated_at`，避免沿用价格 bundle 自身的旧时间字段。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Node.js 内置 `node:test`、GitHub Actions 现有 `stock-data` 分支发布链路

---

### Task 1: 补回归测试基线

**Files:**
- Create: `E:\Ingulf\智能询价系统\tests\discount-utils.test.js`
- Create: `E:\Ingulf\智能询价系统\tests\version-utils.test.js`
- Create: `E:\Ingulf\智能询价系统\tests\publish-price-bundle.test.mjs`

- [ ] **Step 1: 写默认折扣分类的失败测试**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const DiscountUtils = require("../apps/v9/lib/discount-utils.js");

test("名称列为刀具时归类为三菱默认折扣", () => {
  const category = DiscountUtils.getDiscountCategory({
    name: "刀具",
    brand: "",
    spec: "",
    special: "",
  });
  assert.equal(category, "mitsubishi");
});

test("三菱和其他默认值回退为55", () => {
  const config = DiscountUtils.sanitizeDiscountConfig({});
  assert.equal(config.mitsubishi, 55);
  assert.equal(config.other, 55);
});
```

- [ ] **Step 2: 写版本字段选择的失败测试**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const VersionUtils = require("../apps/v9/lib/version-utils.js");

test("价格版本优先取manifest.updated_at", () => {
  assert.equal(
    VersionUtils.pickPriceVersion({
      manifestMeta: { updated_at: "2026-04-03T10:00:00.000Z" },
      bundleMeta: { generated_at: "2026-04-02T10:00:00.000Z", version: "2026-04-01T10:00:00.000Z" },
    }),
    "2026-04-03T10:00:00.000Z"
  );
});
```

- [ ] **Step 3: 写价格发布 manifest 更新时间的失败测试**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { publishPriceBundle } from "../tools/publish_price_bundle.mjs";

test("publishPriceBundle 生成 manifest 时包含 updated_at", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "price-publish-"));
  const input = path.join(dir, "price.bundle.js");
  const outputRoot = path.join(dir, "apps", "v9");
  await mkdir(outputRoot, { recursive: true });
  await writeFile(input, "window.PRICE_BUNDLE = { secured:false, payload:'', meta:{ version:'2026-04-03T00:00:00.000Z' } };");
  await publishPriceBundle({ input, outputRoot });
  const manifest = JSON.parse(await readFile(path.join(outputRoot, "price-manifest.json"), "utf8"));
  assert.ok(manifest.updated_at);
});
```

- [ ] **Step 4: 跑测试确认当前是红灯**

Run: `node --test tests/*.test.js tests/*.test.mjs`
Expected: 至少出现 `version-utils.js` 不存在、三菱分类不符合、或默认值不为 55 的失败。

### Task 2: 实现默认折扣规则与远程配置

**Files:**
- Modify: `E:\Ingulf\智能询价系统\apps\v9\lib\discount-utils.js`
- Modify: `E:\Ingulf\智能询价系统\apps\v9\app.js`
- Modify: `E:\Ingulf\智能询价系统\apps\v9\runtime-config.js`
- Create: `E:\Ingulf\智能询价系统\apps\v9\lib\version-utils.js`

- [ ] **Step 1: 修改默认折扣工具模块**

```js
var FALLBACK_DISCOUNT_PERCENT = 55;
var MITSUBISHI_DISCOUNT_PERCENT = 55;

function getDiscountCategory(item) {
  var source = item || {};
  var special = toStringSafe(source.special);
  var spec = toStringSafe(source.spec);
  var brand = toStringSafe(source.brand || source.b);
  var name = toStringSafe(source.name || source.n);
  var brandAndSpec = brand + " " + spec;

  if (includesNormalized(special, "EX活动")) return "ex";
  if (/OSG/i.test(brandAndSpec)) return "osg";
  if (name === "刀具") return "mitsubishi";
  return "other";
}
```

- [ ] **Step 2: 在前端增加远程默认折扣配置读取与优先级合并**

```js
// 优先级: local > remote > builtin
function getSystemDefaultDiscountConfig() {
  return DiscountEngine.sanitizeDiscountConfig({
    ...getBaseDefaultDiscountConfig(),
    ...(g_RemoteDefaultDiscountConfig || {}),
  });
}
```

- [ ] **Step 3: 新增版本工具模块并接入 app.js**

```js
function pickPriceVersion(input) {
  var source = input || {};
  var manifestMeta = source.manifestMeta || {};
  var bundleMeta = source.bundleMeta || {};
  return (
    manifestMeta.updated_at ||
    bundleMeta.generated_at ||
    bundleMeta.version ||
    "-"
  );
}
```

- [ ] **Step 4: 跑针对性测试确认变绿**

Run: `node --test tests/discount-utils.test.js tests/version-utils.test.js`
Expected: PASS

### Task 3: 调整 v9 布局与版本栏显示

**Files:**
- Modify: `E:\Ingulf\智能询价系统\apps\v9\index.html`
- Modify: `E:\Ingulf\智能询价系统\apps\v9\styles.css`
- Modify: `E:\Ingulf\智能询价系统\apps\v9\app.js`

- [ ] **Step 1: 改 HTML 结构，把结果控制带移动到默认折扣右侧**

```html
<div class="toolbar-secondary-main">
  <div class="step-presets-and-results">
    <div class="step-presets">...</div>
    <div class="toolbar-result-controls">...</div>
  </div>
  <div class="toolbar-copy toolbar-copy-inline">...</div>
</div>
```

- [ ] **Step 2: 改样式比例和结果控制带布局**

```css
.toolbar-main {
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
}

.step-presets-and-results {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}
```

- [ ] **Step 3: 精简结果面板头和顶部版本栏文案**

```js
document.getElementById("versions").textContent =
  "价格版本: " + priceVersion + " | 库存版本: " + stockVersion;
```

- [ ] **Step 4: 运行测试与人工检查**

Run: `node --test tests/discount-utils.test.js tests/version-utils.test.js tests/publish-price-bundle.test.mjs`
Expected: PASS

### Task 4: 调整价格 manifest 缓存与 README

**Files:**
- Modify: `E:\Ingulf\智能询价系统\apps\v9\runtime-config.js`
- Modify: `E:\Ingulf\智能询价系统\README.md`

- [ ] **Step 1: 把价格 manifest cache bust 提升到 hourly**

```js
remotePrice: {
  enabled: true,
  manifestUrl: ".../price-manifest.json",
  timeoutMs: 8000,
  cacheBust: "hourly",
}
```

- [ ] **Step 2: 更新 README，补充远程默认折扣与版本显示说明**

```md
- 新增 `stock-data/apps/v9/default-discount.json` 作为系统默认折扣源
- 页面优先显示 `price-manifest.json.updated_at` 作为价格版本
- 顶部仅展示 `价格版本 | 库存版本`
```

- [ ] **Step 3: 运行最终验证**

Run: `node --test tests/discount-utils.test.js tests/version-utils.test.js tests/publish-price-bundle.test.mjs`
Expected: PASS

Run: `npm run doctor`
Expected: exit 0
