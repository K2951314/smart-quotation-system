const assert = require("assert");
const DataUtils = require("../merger/lib/data-utils");

function row(fields) {
  return {
    ["\u4ee3\u7801"]: fields.code,
    ["\u89c4\u683c\u578b\u53f7"]: fields.spec,
    ["\u9500\u552e\u5355\u4ef7"]: fields.price,
    ["\u540d\u79f0"]: fields.name,
    ["\u52a9\u8bb0\u7801"]: fields.mnemonic,
    ["\u8865\u5145\u8bf4\u660e"]: fields.remark,
    ["\u522b\u540d"]: fields.alias,
    ["\u7279\u4ef7"]: fields.special,
    brand: fields.brand,
  };
}

function run() {
  const dataset = DataUtils.buildPriceDataset([
    row({
      code: "01.01.0001",
      spec: "WNMG080408 UC5115",
      price: "100.5",
      name: "\u5200\u5177",
      mnemonic: "WNMG080408UC5115",
      remark: "remark",
      alias: "CBN",
      special: "EX\u6d3b\u52a8",
      brand: "OSG",
    }),
  ]);

  assert.deepStrictEqual(dataset.bySpec["WNMG080408 UC5115"], {
    c: "01.01.0001",
    p: 100.5,
    s: "EX\u6d3b\u52a8",
    r: "remark",
    b: "OSG",
    n: "\u5200\u5177",
    m: "WNMG080408UC5115",
    a: "CBN",
  });

  const merged = DataUtils.joinPriceStock(dataset, {
    "01.01.0001": "A01:5",
  });

  assert.strictEqual(merged["WNMG080408 UC5115"].n, "\u5200\u5177");
  assert.strictEqual(merged["WNMG080408 UC5115"].m, "WNMG080408UC5115");
  assert.strictEqual(merged["WNMG080408 UC5115"].a, "CBN");
  assert.strictEqual(merged["WNMG080408 UC5115"].i, "A01:5");
}

try {
  run();
  console.log("price-dataset-name-field: OK");
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
