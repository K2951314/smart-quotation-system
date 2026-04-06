# v9 智能询价系统

## 项目简介

`v9` 是一个静态部署的报价/库存查询页面，目标是让使用者在一个页面里完成：

- 按规格、代码、助记码、别名、备注、特价关键词快速检索
- 按库存过滤结果
- 对结果逐条微调折扣并实时重算报价
- 勾选结果后按指定字段一键复制
- 管理默认折扣策略

仓库同时包含了页面前端、数据 bundle 生成脚本、发布脚本、GitHub Actions 工作流和少量 ADR 文档。

## 先看这个：当前真正生效的链路

这个仓库里同时存在“当前生效链路”和“预留/历史链路”，维护前建议先看清楚。

### 1. 页面当前实际使用的加载方式

当前 `apps/v9/index.html` 只加载了这些脚本：

- `apps/v9/lib/query-regex.js`
- `apps/v9/lib/discount-utils.js`
- `apps/v9/lib/result-sort.js`
- `apps/v9/lib/version-utils.js`
- `apps/v9/app.js`

也就是说：

1. 页面**没有**加载 `apps/v9/runtime-config.js`
2. 页面启动后，`apps/v9/app.js` 会优先读取预注入的 `window.PRICE_BUNDLE` / `window.STOCK_BUNDLE`
3. 如果没有预注入，则退回 `fetchWithMirrors()` 中写死的 GitHub 镜像地址去下载 `price.bundle.js` 和 `stock.bundle.js`

### 2. 仓库里还存在的其他链路

仓库中另外还保留了这些配置/文件：

- `apps/v9/runtime-config.js`
- `apps/v9/default-discount.json`
- `.github/workflows/build-bundle.yml`
- `apps/v9/lib/remote-source-utils.js`

它们目前的状态是：

| 文件 | 当前状态 | 说明 |
| --- | --- | --- |
| `apps/v9/runtime-config.js` | 预留，当前页面未加载 | 改这个文件，当前页面不会直接生效 |
| `apps/v9/default-discount.json` | 预留，当前前端未读取 | 当前默认折扣实际来自代码内置值和浏览器本地存储 |
| `.github/workflows/build-bundle.yml` | 历史方案 | 仍然使用旧的 `data` 分支思路，与 `sync-*.yml` 的 `stock-data` 分支方案不完全一致 |
| `apps/v9/lib/remote-source-utils.js` | 工具库/测试覆盖，当前页面未接入 | 可作为后续接回 manifest 方案的基础 |

### 3. 这意味着什么

如果你要改配置，请先判断你是在改哪一层：

- 想改**页面真实加载行为**：优先看 `apps/v9/app.js`
- 想改**bundle 生成/发布流程**：看 `tools/*.mjs`、`config/*.json`、`.github/workflows/*.yml`
- 想改**README 里提到但页面未实际使用的预留配置**：要先把页面接回那条链路，否则只改文件不会生效

## 目录结构

```text
apps/v9/
  index.html              页面入口
  styles.css              页面样式
  app.js                  页面主逻辑
  default-discount.json   预留的默认折扣文件（当前前端未读取）
  runtime-config.js       预留的远程配置文件（当前前端未加载）
  _headers                Netlify 头配置
  lib/
    query-regex.js        查询匹配逻辑
    discount-utils.js     默认折扣和折扣工具
    result-sort.js        已勾选结果排序逻辑
    version-utils.js      版本文本选择逻辑
    remote-source-utils.js 远程地址与 cache bust 工具（当前页面未接入）

config/
  system.json             输出路径和脚本路径
  price-source.json       价格源配置
  stock-source.json       库存源配置
  *.schema.json           对应配置 schema

tools/
  sync_price_bundle.mjs   拉取价格源并生成价格 bundle
  sync_stock_bundle.mjs   拉取库存源并生成库存 bundle
  publish_price_bundle.mjs 将价格 bundle 发布为 hash 文件 + manifest
  publish_stock_bundle.mjs 将库存 bundle 发布为固定文件 + manifest

scripts/
  doctor.mjs              仓库健康检查

tests/
  *.test.js / *.test.mjs  单元测试与回归测试

.github/workflows/
  ci.yml                  CI
  sync-price.yml          定时同步价格
  sync-stock.yml          定时同步库存
  publish-price.yml       手动发布价格 bundle
  build-bundle.yml        历史工作流
```

## 页面功能说明

### 1. 顶部状态区

页面顶部会显示：

- 当前加载状态
- 价格版本
- 库存版本

当前 `app.js` 的版本显示逻辑来自 bundle 自身的 `meta`，优先顺序为：

`updated_at -> content_updated_at -> generated_at -> version -> "-" `

注意：当前页面没有走 manifest 拉取链路，因此这里显示的是**已加载 bundle 内部的 meta**，不是 `runtime-config.js` 里的配置。

### 2. 查询控制台

查询控制台目前有 4 个主按钮：

- `智能查询`
- `库存查询`
- `三菱库存`
- `复制勾选`

#### 智能查询

- 读取输入框中的多行内容
- 每一行按空白拆分为多个关键词
- 用 `关键词1.*关键词2.*关键词3` 的方式生成忽略大小写的正则
- 在以下字段中匹配：规格、代码、助记码、备注、别名、特价

#### 库存查询

逻辑与智能查询相同，但会额外过滤掉“库存字段为空”的结果。

#### 三菱库存

点击后会做两件事：

1. 把 `MMC_PASSWORD` 复制到剪贴板
2. 打开 `MMC_URL`

这两个常量当前写死在 `apps/v9/app.js` 里。如果登录地址或密码变了，要直接改代码。

#### 复制勾选

只复制当前勾选的结果。复制内容由“复制字段复选框”控制，详见下文。

### 3. 参数区

页面上当前有 3 个核心参数：

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| 折扣步长 | `0.1` | 控制结果卡片里 `+ / -` 按钮每次增减多少折扣百分点 |
| 小数位数 | `1` | 报价保留的小数位数 |
| 取整阈值 | `100` | 当报价结果高于这个阈值时，直接向上取整为整数 |

报价计算逻辑在 `apps/v9/app.js` 的 `calcDiscountedPrice()` 中，规则是：

1. 先计算 `面价 × 折扣`
2. 按“小数位数”做向上取整
3. 如果结果高于“取整阈值”，则直接按整数向上取整

### 4. 步长快捷按钮

页面内置 3 个步长快捷值：

- `0.1`
- `0.5`
- `1`

点击后会直接覆盖“折扣步长”输入框。

### 5. 默认折扣弹窗

点击 `默认折扣` 按钮会打开配置弹窗，当前可设置 4 类默认折扣：

- `EX`
- `OSG`
- `三菱`
- `其他`

保存后会：

- 写入浏览器 `localStorage`
- 更新按钮提示
- 对当前结果中“尚未手动改过折扣”的行重新应用默认折扣

当前页面真实生效的优先级是：

`localStorage > 代码内置默认值`

注意：虽然仓库里有 `apps/v9/default-discount.json`，但**当前前端没有读取它**。

### 6. 输入框与匹配逻辑

#### 输入方式

- 支持多行输入
- 每行代表一次独立查询
- 一行内支持多个关键词

示例：

```text
WNMG080408 UC5115
MGMN300 M
```

#### 自动勾选规则

当前命中结果后会自动勾选两种情况：

- 某一行输入与规格完全一致
- 某一行只匹配到 1 条结果

#### 精确匹配

如果输入行与规格型号完全一致，会额外打上精确匹配样式。

### 7. 结果区

每条结果卡片当前包含这些信息：

- 勾选状态
- 代码
- 规格型号
- 库存标签
- 特价标签
- 备注标签
- 面价
- 报价
- 折扣调节区

#### 折扣调节

结果卡片支持两种调价方式：

- 点 `-` / `+`
- 直接手输折扣百分比

细节：

- 折扣范围会被夹在 `0 ~ 100`
- 最小步长为 `0.1`
- 长按 `+ / -` 会连续调价
- 长按启动延迟是 `280ms`
- 连续调价间隔是 `70ms`

#### 结果排序

当前排序逻辑是：

1. 已勾选结果排在前面
2. 未勾选结果排在后面
3. 同组内保持原始稳定顺序

也就是说，勾选/取消勾选后结果会自动重排。

### 8. 复制字段选项

当前复制区有 6 个字段开关：

- `代码`
- `规格`
- `报价`
- `特价`
- `库存`
- `备注`

默认勾选状态：

| 字段 | 默认是否勾选 |
| --- | --- |
| 代码 | 是 |
| 规格 | 是 |
| 报价 | 是 |
| 特价 | 否 |
| 库存 | 否 |
| 备注 | 否 |

复制格式：

- 第一行拼接启用的字段
- 如果勾选了“备注”且该行有备注，则在下一行额外追加备注文本

### 9. 移动端行为

当前手机端（`<=720px`）的主要行为：

- 查询控制台 `toolbar` 置顶
- 输入框不悬浮，随页面自然滚动
- 结果与复制控制压缩为更紧凑布局
- 出现“回到顶部”按钮

## 默认参数与默认行为

### 1. 页面默认值

| 项目 | 当前默认值 | 定义位置 | 备注 |
| --- | --- | --- | --- |
| 折扣步长 | `0.1` | `apps/v9/index.html` / `apps/v9/lib/discount-utils.js` | 小于等于 0 会被修正为 `0.1` |
| 步长快捷按钮 | `0.1 / 0.5 / 1` | `apps/v9/index.html` | 仅快捷填充值 |
| 小数位数 | `1` | `apps/v9/index.html` | 刷新后恢复默认 |
| 取整阈值 | `100` | `apps/v9/index.html` | 刷新后恢复默认 |
| EX 默认折扣 | `32` | `apps/v9/lib/discount-utils.js` / `apps/v9/app.js` | 代码有双份默认值 |
| OSG 默认折扣 | `36` | 同上 | 代码有双份默认值 |
| 三菱默认折扣 | `55` | 同上 | 代码有双份默认值 |
| 其他默认折扣 | `55` | 同上 | 代码有双份默认值 |
| 默认复制字段 | 代码/规格/报价 | `apps/v9/index.html` | 其余默认不勾选 |
| 本地存储 key | `v9-default-discount-config` | `apps/v9/app.js` | 仅默认折扣会持久化 |
| 长按启动延迟 | `280ms` | `apps/v9/app.js` | `HOLD_START_DELAY_MS` |
| 连续调价间隔 | `70ms` | `apps/v9/app.js` | `HOLD_REPEAT_INTERVAL_MS` |
| Toast 时长 | `1500ms` | `apps/v9/app.js` | 复制/保存提示 |

### 2. 默认折扣分类规则

当前折扣分类逻辑如下：

1. 如果“特价”字段包含 `EX活动`，归为 `ex`
2. 否则如果 `brand + spec` 中包含 `OSG`，归为 `osg`
3. 否则如果“名称”字段严格等于 `刀具`，归为 `mitsubishi`
4. 否则归为 `other`

如果你改默认折扣规则，请同步检查：

- `apps/v9/lib/discount-utils.js`
- `apps/v9/app.js`

当前这两处都保留了默认折扣兜底逻辑，最好一起改，避免将来出现不一致。

## 如何调整配置

### 1. 页面内可以直接调的内容

这些内容不需要改代码，直接在页面操作即可：

- 折扣步长
- 小数位数
- 取整阈值
- 默认折扣弹窗中的 4 类折扣
- 复制字段勾选项
- 结果勾选状态

其中只有“默认折扣弹窗”会持久化到本地浏览器。

#### 如果要恢复默认折扣

有两种方式：

- 在页面弹窗里点击“恢复默认”
- 手动清理浏览器 `localStorage` 中的 `v9-default-discount-config`

### 2. 改页面默认行为

#### 改默认折扣

优先修改：

- `apps/v9/lib/discount-utils.js`
- `apps/v9/app.js`

建议同时改这两处：

- `DEFAULT_DISCOUNT_CONFIG`
- 相关标签文字
- 折扣分类规则

#### 改折扣步长默认值

修改：

- `apps/v9/index.html` 中 `#discountStep` 的默认 `value`
- 如需全局最小步长一起变更，再改 `apps/v9/lib/discount-utils.js` 中 `DEFAULT_STEP_PERCENT`

#### 改小数位数和取整阈值默认值

修改 `apps/v9/index.html`：

- `#decimals`
- `#threshold`

#### 改复制字段默认勾选

修改 `apps/v9/index.html` 中这些 checkbox 的 `checked` 属性：

- `#chk_code`
- `#chk_spec`
- `#chk_price`
- `#chk_special`
- `#chk_stock`
- `#chk_remark`

#### 改三菱库存按钮行为

修改 `apps/v9/app.js` 顶部常量：

- `MMC_URL`
- `MMC_PASSWORD`

当前密码直接放在前端代码里，这对公开部署并不安全。如果后续要对外开放，建议改成更安全的服务端或密钥管理方案。

#### 改页面真实远程加载地址

当前真正会被页面用到的是 `apps/v9/app.js` 里的 `fetchWithMirrors()`。

如果你想改前端真实拉取地址，请修改那 3 个镜像 URL，而不是只改 `runtime-config.js`。

#### 改移动端布局

修改 `apps/v9/styles.css`，重点看：

- `.toolbar`
- `.query-panel`
- `@media (max-width: 720px)`

### 3. 改 bundle 生成/同步配置

#### `config/system.json`

```json
{
  "app": {
    "web_root": "apps/v9",
    "price_bundle_path": "apps/v9/price.bundle.js",
    "stock_bundle_path": "apps/v9/stock.bundle.js"
  },
  "sync": {
    "script_path": "tools/sync_stock_bundle.mjs"
  }
}
```

字段说明：

| 字段 | 作用 |
| --- | --- |
| `app.web_root` | 页面发布目录 |
| `app.price_bundle_path` | 本地价格 bundle 输出路径 |
| `app.stock_bundle_path` | 本地库存 bundle 输出路径 |
| `sync.script_path` | 库存同步脚本路径，`sync-stock.yml` 会读取它 |

#### `config/price-source.json`

当前默认内容：

```json
{
  "price_source_url": "",
  "price_source_token": "",
  "allowed_content_types": ["xlsx"],
  "timeout_ms": 15000,
  "max_bytes": 20971520,
  "allowed_domains": []
}
```

字段说明：

| 字段 | 作用 | 当前是否实际生效 |
| --- | --- | --- |
| `price_source_url` | 价格源地址 | 是 |
| `price_source_token` | 价格源 Bearer Token | 是 |
| `allowed_content_types` | 允许的源类型 | 是 |
| `timeout_ms` | 请求超时毫秒数 | 是 |
| `max_bytes` | 最大允许响应大小 | 是 |
| `allowed_domains` | 允许域名白名单 | 当前脚本未真正使用，属于预留字段 |

#### `config/stock-source.json`

当前默认内容：

```json
{
  "stock_source_url": "",
  "stock_source_token": "",
  "allowed_content_types": ["csv", "json", "xlsx", "js"],
  "timeout_ms": 15000,
  "max_bytes": 20971520,
  "allowed_domains": []
}
```

字段说明与价格源基本相同，区别是库存源默认允许更多输入类型。

### 4. 环境变量与 GitHub Secrets

脚本/工作流会优先读取这些环境变量或 Secrets：

- `PRICE_SOURCE_URL`
- `PRICE_SOURCE_TOKEN`
- `STOCK_SOURCE_URL`
- `STOCK_SOURCE_TOKEN`
- `PRICE_BUNDLE_PASSWORD`

覆盖规则：

`环境变量 / GitHub Secrets > config/*.json`

其中：

- `PRICE_BUNDLE_PASSWORD` 仅价格 bundle 用于加密模式
- 如果你要求价格脚本走 `encrypted` 模式，但没有提供密码，脚本会自动降级为 `plain`

## 数据源格式说明

### 1. 价格源支持类型

`tools/sync_price_bundle.mjs` 当前支持：

- `xlsx`
- `csv`
- `json`
- `js`

#### 价格表标准列

推荐使用这些中文列名：

- `代码`
- `规格型号`
- `销售单价`
- `名称`
- `助记码`
- `补充说明`
- `别名`
- `特价`

额外支持：

- `brand`

#### 价格 JSON 支持的结构

支持以下 3 种结构：

1. 行数组
2. `{ "rows": [...] }`
3. `{ "bySpec": { ... } }`

#### 价格 JS 支持的结构

可以直接给一个已有的 `price.bundle.js`，脚本会读取其中的 `window.PRICE_BUNDLE`。

### 2. 库存源支持类型

`tools/sync_stock_bundle.mjs` 当前支持：

- `csv`
- `json`
- `xlsx`
- `js`

#### 库存列别名

脚本会自动识别这些别名：

| 目标字段 | 支持列名 |
| --- | --- |
| 代码 | `物料长代码` / `代码` / `物料编码` / `编码` |
| 仓库 | `发料仓库` / `仓库` / `仓位` / `仓` |
| 数量 | `库存数量` / `数量` / `可用数量` / `库存` |
| 状态 | `参考状态` / `状态` / `备注` |

生成后的库存文本格式类似：

```text
A仓:12 | B仓:3(待检)
```

#### 库存 JSON 支持的结构

支持：

1. `{ "byCode": { ... } }`
2. 行数组

#### 过滤规则

库存行如果同时满足下面两点，会被忽略：

- 数量为空或为 `0`
- 状态也为空

## 本地命令

### 1. 安装依赖

```bash
npm ci
```

### 2. 跑测试

```bash
npm test
```

### 3. 仓库健康检查

```bash
npm run doctor
```

会检查：

- 核心配置文件是否存在
- workflow 是否存在
- 关键脚本是否存在
- `price-source.json` / `stock-source.json` 的关键字段是否是合法数字/数组

### 4. 本地同步库存 bundle

```bash
npm run sync:stock
```

等价于：

```bash
node tools/sync_stock_bundle.mjs --config config/system.json --stock-config config/stock-source.json
```

### 5. 本地同步价格 bundle

```bash
npm run sync:price
```

等价于：

```bash
node tools/sync_price_bundle.mjs --config config/system.json --price-config config/price-source.json --mode encrypted
```

#### 价格同步可选参数

脚本支持这些参数：

- `--config`
- `--price-config`
- `--schema`
- `--output`
- `--mode encrypted|plain`

### 6. 发布价格 bundle

```bash
npm run publish:price
```

会生成：

- `apps/v9/price/price.<hash>.bundle.js`
- `apps/v9/price-manifest.json`

### 7. 发布库存 bundle

```bash
npm run publish:stock
```

会生成：

- `apps/v9/stock.bundle.js`
- `apps/v9/stock-manifest.json`

## 发布产物与 manifest 说明

### 1. 价格产物

价格发布脚本会把 bundle 发布成带 hash 的文件名，例如：

```text
apps/v9/price/price.06115dbf95cf.bundle.js
```

并生成 `price-manifest.json`。

### 2. 库存产物

库存发布脚本保持固定文件名：

```text
apps/v9/stock.bundle.js
```

并生成 `stock-manifest.json`。

### 3. manifest 字段含义

价格和库存 manifest 都包含：

- `latest`
- `hash`
- `updated_at`
- `content_updated_at`

语义：

- `updated_at`：最近一次发布脚本成功执行的时间
- `content_updated_at`：内容真正变化的时间

如果内容没变但又重新发布了：

- `updated_at` 会刷新
- `content_updated_at` 会保持原值

## GitHub Actions 与部署

### 1. CI

`.github/workflows/ci.yml`

- 在 `push` 到 `main/master` 以及 `pull_request` 时运行
- 执行 `npm ci`
- 执行 `npm test`

### 2. 定时同步库存

`.github/workflows/sync-stock.yml`

- 每天执行一次：`0 16 * * *`（UTC）
- 需要 Secrets：
  - `STOCK_SOURCE_URL`
  - `STOCK_SOURCE_TOKEN`（如有）
- 产物发布到 `stock-data` 分支

### 3. 定时同步价格

`.github/workflows/sync-price.yml`

- 每天执行一次：`15 16 * * *`（UTC）
- 支持手动选择 `mode`：
  - `encrypted`
  - `plain`
- 需要 Secrets：
  - `PRICE_SOURCE_URL`
  - `PRICE_SOURCE_TOKEN`（如有）
  - `PRICE_BUNDLE_PASSWORD`（加密模式时）

### 4. 手动发布价格

`.github/workflows/publish-price.yml`

- 从本地 `apps/v9/price.bundle.js` 读取
- 发布到 `stock-data` 分支

### 5. 历史工作流

`.github/workflows/build-bundle.yml`

这个文件仍然存在，但它使用的是旧的 `data` 分支方案。和当前 `sync-price.yml` / `sync-stock.yml` / `publish-price.yml` 的 `stock-data` 分支方案并不统一。

如果你准备继续维护工作流，请先决定保留哪套方案，再统一：

- 前端真实拉取地址
- GitHub Actions 发布目标分支
- bundle 存放路径

### 6. Netlify

`netlify.toml` 当前配置：

```toml
[build]
publish = "apps/v9"
command = ""
```

说明：

- Netlify 发布目录是 `apps/v9`
- 当前没有单独 build 命令

`apps/v9/_headers` 当前给带 hash 的 bundle 设置了长期缓存：

```text
/*.bundle.*.js
  Cache-Control: public, max-age=31536000, immutable
```

## 常见维护场景

### 场景 1：我只想改页面默认折扣

优先改：

- `apps/v9/lib/discount-utils.js`
- `apps/v9/app.js`

如果已经有人本地保存过折扣，还需要提醒他们清理 `localStorage`，否则旧值会继续覆盖。

### 场景 2：我只想换远程数据源地址

如果你改的是**同步脚本/工作流的数据源**，改：

- `config/price-source.json`
- `config/stock-source.json`
- 或对应 GitHub Secrets

如果你改的是**页面运行时实际从哪里拉 bundle**，改：

- `apps/v9/app.js` 里的 `fetchWithMirrors()`

只改 `runtime-config.js`，当前页面不会生效。

### 场景 3：我想让页面真正使用 manifest / raw GitHub 配置

你需要做的是“接回链路”，而不是只改配置文件。至少要处理：

- 在 `index.html` 中引入 `runtime-config.js`
- 在 `app.js` 中真正读取 `window.APP_CONFIG`
- 接上 `remote-source-utils.js`
- 统一当前的 `data` / `stock-data` 分支逻辑

### 场景 4：我想更换价格加密策略

优先看：

- `tools/sync_price_bundle.mjs`
- `merger/lib/bundle-utils.js`

当前行为：

- `--mode encrypted` 时会尝试加密
- 如果没有 `PRICE_BUNDLE_PASSWORD`，会自动回退为 `plain`

## 已知注意事项

1. 当前仓库存在多套并存的数据加载/发布方案，维护时不要假设“配置文件一定会被页面读取”。
2. `apps/v9/default-discount.json` 当前不是页面真实生效项。
3. `apps/v9/runtime-config.js` 当前不是页面真实生效项。
4. `apps/v9/app.js` 中的 GitHub 镜像地址、MMC 地址/密码都属于硬编码项。
5. 默认折扣目前在 `discount-utils.js` 和 `app.js` 里各有一份兜底逻辑，修改时建议同步。

## 相关文档

- `docs/adr/0001-split-price-stock-bundle.md`
- `docs/adr/0002-external-stock-sync.md`
- `docs/superpowers/plans/2026-04-03-v9-default-discount-and-version-refresh.md`
