const assert = require("assert");
const DiscountUtils = require("../apps/v9/lib/discount-utils");

function run() {
  assert.strictEqual(
    DiscountUtils.getDefaultDiscountPercent({ spec: "WNMG080408", special: "" }),
    53,
    "unmatched specs should default to 53%"
  );
  assert.strictEqual(
    DiscountUtils.getDefaultDiscountPercent({ spec: "OSG A-TAP M8", special: "" }),
    36,
    "OSG spec should default to 36%"
  );
  assert.strictEqual(
    DiscountUtils.getDefaultDiscountPercent({ spec: "OSG A-TAP M8", special: "EX\u6d3b\u52a8" }),
    32,
    "EX activity should override other rules"
  );
  assert.strictEqual(
    DiscountUtils.getDefaultDiscountPercent({ spec: "\u666e\u901a\u4ea7\u54c1", special: "" }),
    53,
    "unmatched items should fall back to 53%"
  );

  assert.strictEqual(DiscountUtils.formatDiscountPercent(53), "53%");
  assert.strictEqual(DiscountUtils.formatDiscountPercent(53.5), "53.5%");
  assert.strictEqual(DiscountUtils.formatDiscountPercent(53.01), "53.01%");

  assert.strictEqual(DiscountUtils.shiftDiscountPercent(53, 0.01, 1), 53.01);
  assert.strictEqual(DiscountUtils.shiftDiscountPercent(53, 0.5, 1), 53.5);
  assert.strictEqual(DiscountUtils.shiftDiscountPercent(0, 0.5, -1), 0);
  assert.strictEqual(DiscountUtils.shiftDiscountPercent(100, 0.5, 1), 100);
  assert.strictEqual(DiscountUtils.sanitizeStepPercent("0"), 0.01);
}

try {
  run();
  console.log("v9-discount-utils: OK");
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
