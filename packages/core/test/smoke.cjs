// Proves the core's plumbing without any network: auth injection reaches the
// resolver, permission guards fire, arg validation works, and dispatch routes.
// Run: node test/smoke.cjs
const assert = require("node:assert");
const { executeTool } = require("../dist/index.js");

let failures = 0;
async function expectThrow(label, fn, matcher) {
  try {
    await fn();
    console.error(`✗ ${label}: expected throw, got none`);
    failures++;
  } catch (e) {
    if (matcher && !matcher.test(e.message)) {
      console.error(`✗ ${label}: message "${e.message}" didn't match ${matcher}`);
      failures++;
    } else {
      console.log(`✓ ${label}`);
    }
  }
}

function resolver(permissions) {
  const calls = [];
  const fn = async (email) => {
    calls.push(email);
    return { client: {}, permissions };
  };
  fn.calls = calls;
  return fn;
}

(async () => {
  // 1. Permission guard: readonly Gmail cannot send. Also proves the resolver
  //    was invoked with the tool's email (auth injection works).
  const r1 = resolver({ gmail: "readonly", calendar: "none", drive: "none", chat: "none" });
  await expectThrow(
    "gmail_send denied when gmail=readonly",
    () => executeTool(r1, "gmail_send", { email: "user@x.com", to: "a@b.com", subject: "s", body: "b" }),
    /requires 'full'/,
  );
  assert.deepStrictEqual(r1.calls, ["user@x.com"], "resolver should receive the tool's email");
  console.log("✓ resolver invoked with the tool's email");

  // 2. gmail=none cannot draft (modify guard).
  const r2 = resolver({ gmail: "none", calendar: "none", drive: "none", chat: "none" });
  await expectThrow(
    "gmail_draft denied when gmail=none",
    () => executeTool(r2, "gmail_draft", { email: "u@x.com", to: "a@b.com", subject: "s", body: "b" }),
    /requires 'draft' or 'full'/,
  );

  // 3. Arg validation before any auth work.
  const r3 = resolver({ gmail: "full", calendar: "none", drive: "none", chat: "none" });
  await expectThrow(
    "gmail_send rejects missing 'to'",
    () => executeTool(r3, "gmail_send", { email: "u@x.com", subject: "s", body: "b" }),
    /Missing or invalid/,
  );

  // 4. Unknown tool.
  await expectThrow(
    "unknown tool rejected",
    () => executeTool(r3, "gmail_teleport", {}),
    /Unknown or unimplemented/,
  );

  if (failures) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll core smoke checks passed.");
})();
