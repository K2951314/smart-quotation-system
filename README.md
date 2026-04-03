# v9 智能询价系统

## 架构说明
- 页面入口：`apps/v9/index.html`
- Netlify 继续发布 `apps/v9`
- 大数据文件继续走 GitHub CDN，避免把高频变更流量压到 Netlify
  - 价格：`stock-data/apps/v9/price-manifest.json` -> `price/price.<hash>.bundle.js`
  - 库存：`stock-data/apps/v9/stock.bundle.js`
  - 默认折扣：`stock-data/apps/v9/default-discount.json`
- `apps/v9` 不再保存本地 `price.bundle.js`、`stock.bundle.js`

## 页面行为
- 页面打开时立即加载远程价格、库存和默认折扣配置
- 顶部版本栏只显示：`价格版本 | 库存版本`
- 价格版本优先显示 `price-manifest.json.updated_at`
- 库存版本优先显示 `stock.bundle.js.meta.generated_at`
- 查询结果的默认折扣优先级：
  - 本地弹窗保存值
  - GitHub 远程默认折扣
  - 内置默认值

## 默认折扣规则
- `EX活动`：按活动规则命中
- `OSG`：按品牌/规格中的 `OSG` 命中
- `三菱`：名称列严格等于 `刀具`
- `其他`：其余结果

内置默认值：
- `EX = 32%`
- `OSG = 36%`
- `三菱 = 55%`
- `其他 = 55%`

### GitHub 远程默认折扣格式
在 `stock-data/apps/v9/default-discount.json` 中维护：

```json
{
  "updated_at": "2026-04-03T10:00:00.000Z",
  "defaults": {
    "ex": 32,
    "osg": 36,
    "mitsubishi": 55,
    "other": 55
  }
}
```

说明：
- `defaults` 可只写需要覆盖的字段
- 本地已经手动保存过默认折扣时，页面不会被远程值强制覆盖
- 点击“恢复默认”时，会恢复到“远程默认值或内置默认值”

## 价格加密
- 推荐工作流：`Sync Price Bundle`
- `mode=encrypted` 需要 Secret `PRICE_BUNDLE_PASSWORD`
- `mode=plain` 不加密
- 不再使用 Excel `Password Sheet`

## 必要配置
- `config/system.json`
- `config/stock-source.json`
- `config/stock-source.schema.json`
- `config/price-source.json`
- `config/price-source.schema.json`

## 必要 Secrets
- `STOCK_SOURCE_URL`
- `STOCK_SOURCE_TOKEN`
- `PRICE_SOURCE_URL`
- `PRICE_SOURCE_TOKEN`
- `PRICE_BUNDLE_PASSWORD`（仅 `encrypted` 模式需要）

## 工作流
- `.github/workflows/sync-stock.yml`
  - 定时同步库存到 `stock-data`
- `.github/workflows/sync-price.yml`
  - 定时同步价格到 `stock-data`
  - 支持手动运行并选择 `encrypted/plain`
- `.github/workflows/publish-price.yml`
  - 手动发布本地价格包到 `stock-data`

## 本地命令
```bash
npm ci
npm test
npm run doctor
npm run sync:stock
npm run sync:price
```

## 链接校验
远程源必须指向可下载文件/API，而不是网页：

```powershell
curl.exe -L -o NUL -w "http:%{http_code} type:%{content_type}`n" "在线表格链接"
```

通过标准：
- `http:200`
- `type` 不是 `text/html`

## 调整频率
修改以下工作流里的 `cron`：
- `.github/workflows/sync-stock.yml`
- `.github/workflows/sync-price.yml`
