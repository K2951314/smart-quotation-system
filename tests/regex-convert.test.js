const assert = require("assert");
const QueryRegex = require("../apps/v9/lib/query-regex.js");

function run() {
  assert.strictEqual(QueryRegex.escapeRegexLiteral("A+B(1)"), "A\\+B\\(1\\)");
  assert.strictEqual(QueryRegex.escapeRegexLiteral("W.*N"), "W\\.\\*N");

  const converted = QueryRegex.convertPlainLineToRegex("WNMG080408 UC5115");
  assert.ok(converted instanceof RegExp, "converted regex should be RegExp");
  assert.strictEqual(converted.source, "WNMG080408.*UC5115");
  assert.strictEqual(converted.flags, "i");

  assert.strictEqual(
    QueryRegex.matchRegexTarget("WNMG080408", "01.01.12345", "UC5115 coating", converted),
    true,
    "should match when remark satisfies converted regex"
  );
  assert.strictEqual(
    QueryRegex.matchRegexTarget("CNMG120404", "02.02.00001", "for steel", converted),
    false,
    "should not match unrelated rows"
  );

  const remarkOnly = QueryRegex.convertPlainLineToRegex("H7-123");
  assert.strictEqual(QueryRegex.matchRegexTarget("spec", "code", "Remark H7-123", remarkOnly), true);
  assert.strictEqual(QueryRegex.hasStockValue("A仓:12"), true);
  assert.strictEqual(QueryRegex.hasStockValue("   "), false);
}

try {
  run();
  console.log("regex-convert: OK");
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
