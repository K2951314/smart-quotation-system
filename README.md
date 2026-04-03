# v9 智能询价系统

## 架构说明
- 线上页面：`apps/v9/index.html`
- 数据模式：**远程唯一来源**
  - 价格：`stock-data/apps/v9/price-manifest.json` -> `price/price.<hash>.bundle.js`
  - 库存：`stock-data/apps/v9/stock.bundle.js`
- `apps/v9` 不再保存本地 `price.bundle.js`、`stock.bundle.js`
- Netlify 仍发布 `apps/v9`

## 查询端行为
- 页面打开时立即加载远程价格+库存（不再“首次查询再加载”）
- `智能匹配`：原关键词包含匹配
- `正则转换`：空格转通配符后立即查询，匹配范围为`规格+代码+备注`

## 价格加密与密码管理
- 推荐工作流：`Sync Price Bundle`
- `mode=encrypted`：需要 Secret `PRICE_BUNDLE_PASSWORD`
- `mode=plain`：不加密（等价于删除密码）
- 不使用 Excel `Password Sheet`

## 必要配置
- `config/system.json`
- `config/stock-source.json`
- `config/stock-source.schema.json`
- `config/price-source.json`
- `config/price-source.schema.json`

## 必要 Secrets
- `STOCK_SOURCE_URL`（必填）
- `STOCK_SOURCE_TOKEN`（可选）
- `PRICE_SOURCE_URL`（必填）
- `PRICE_SOURCE_TOKEN`（可选）
- `PRICE_BUNDLE_PASSWORD`（仅 `mode=encrypted` 需要）

## 链接校验（必须是文件/API，不是页面）
```powershell
curl.exe -L -o NUL -w "http:%{http_code} type:%{content_type}`n" "在线表格链接"
```
通过标准：
- `http:200`
- `type` 不是 `text/html`

## 工作流
- `.github/workflows/sync-stock.yml`
  - 每日同步库存到 `stock-data`
- `.github/workflows/sync-price.yml`
  - 每日同步价格到 `stock-data`
  - 支持手动运行并选择 `mode=encrypted/plain`
- `.github/workflows/publish-price.yml`
  - 手动发布本地价格包（保留为备用通道）

## 本地命令
```bash
npm ci
npm test
npm run doctor
npm run sync:stock
npm run sync:price
```

## 调整频率
修改以下文件中的 `cron`：
- `.github/workflows/sync-stock.yml`
- `.github/workflows/sync-price.yml`
