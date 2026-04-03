# v9 智能询价系统

## 结构
- 页面入口：`apps/v9/index.html`
- Netlify 发布根目录：`apps/v9`
- 远程数据继续走 GitHub CDN，避免把频繁变更的数据流量压回 Netlify
  - 价格：`stock-data/apps/v9/price-manifest.json` -> `price/price.<hash>.bundle.js`
  - 库存：`stock-data/apps/v9/stock-manifest.json` -> `stock.bundle.js`
  - 默认折扣：`main/apps/v9/default-discount.json`

## 版本显示
- 顶部只显示：`价格版本 | 库存版本`
- 价格版本优先显示 `price-manifest.json.updated_at`
- 库存版本优先显示 `stock-manifest.json.updated_at`
- 如果 manifest 不可用，再回退 bundle 的 `generated_at/version`

### manifest 语义
- `updated_at`：最近一次工作流成功发布到远程的时间
- `content_updated_at`：内容哈希真正变化的时间
- 这样即使数据内容没变，只要工作流成功跑完，页面版本也会刷新

## 默认折扣
- 分类顺序：`EX活动 -> OSG -> 三菱 -> 其他`
- 三菱判断：名称列严格等于 `刀具`
- 内置默认值：
  - `EX = 32%`
  - `OSG = 36%`
  - `三菱 = 55%`
  - `其他 = 55%`
- 生效优先级：`本地保存 > GitHub 远程默认值 > 内置默认值`

### 远程默认折扣文件
在 `apps/v9/default-discount.json` 维护：

```json
{
  "updated_at": "2026-04-03T11:00:00.000Z",
  "defaults": {
    "ex": 32,
    "osg": 36,
    "mitsubishi": 55,
    "other": 55
  }
}
```

## 工作流
- `.github/workflows/sync-price.yml`
  - 拉取源价格文件
  - 生成 `tmp/price.bundle.js`
  - 发布到 `stock-data/apps/v9/price-manifest.json`
- `.github/workflows/sync-stock.yml`
  - 拉取源库存文件
  - 生成 `tmp/stock.bundle.js`
  - 发布到 `stock-data/apps/v9/stock-manifest.json`
- `.github/workflows/publish-price.yml`
  - 手动把本地价格包发布到 `stock-data`

## 本地命令
```bash
npm ci
npm test
npm run doctor
npm run sync:stock
npm run sync:price
npm run publish:stock
npm run publish:price
```
