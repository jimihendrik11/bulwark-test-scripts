import fs from "node:fs";

const raw = fs.readFileSync("results/CCIP-fork.json", "utf8").replace(/^\uFEFF/, "");
const report = JSON.parse(raw);
const suites = Object.values(report);
if (suites.length !== 1) {
  console.error(`expected one suite, got ${suites.length}`);
  process.exit(1);
}

const results = suites[0].test_results || {};
const names = Object.keys(results);
const passed = names.filter((name) => results[name].status === "Success");
for (const name of names) {
  console.log(`${results[name].status === "Success" ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`${passed.length}/${names.length} CCIP fork tests pass`);

if (names.length !== 8 || passed.length !== names.length) {
  console.error("CCIP fork suite is not 8/8");
  process.exit(1);
}
console.log("MATCH: CCIP fork suite");
