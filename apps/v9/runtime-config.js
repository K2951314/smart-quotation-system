window.APP_CONFIG = {
  remotePrice: {
    enabled: true,
    manifestUrl: "https://cdn.jsdelivr.net/gh/K2951314/-@stock-data/apps/v9/price-manifest.json",
    timeoutMs: 8000,
    cacheBust: "hourly",
  },
  remoteStock: {
    enabled: true,
    manifestUrl: "https://cdn.jsdelivr.net/gh/K2951314/-@stock-data/apps/v9/stock-manifest.json",
    url: "https://cdn.jsdelivr.net/gh/K2951314/-@stock-data/apps/v9/stock.bundle.js",
    timeoutMs: 8000,
    cacheBust: "daily",
  },
  defaultDiscount: {
    enabled: true,
    url: "https://cdn.jsdelivr.net/gh/K2951314/-@main/apps/v9/default-discount.json",
    timeoutMs: 4000,
    cacheBust: "hourly",
  },
};
