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

  // 5. Calendar/Drive/Chat guards fire when the service is read-only.
  const readonlyAll = resolver({ gmail: "readonly", calendar: "readonly", drive: "readonly", chat: "readonly" });
  await expectThrow(
    "calendar_create_event denied when calendar=readonly",
    () => executeTool(readonlyAll, "calendar_create_event", { email: "u@x.com", calendarId: "primary", title: "t", startDateTime: "2026-01-01T10:00:00Z", endDateTime: "2026-01-01T11:00:00Z" }),
    /requires 'full'/,
  );
  await expectThrow(
    "drive_upload_file denied when drive=readonly",
    () => executeTool(readonlyAll, "drive_upload_file", { email: "u@x.com", filename: "f.txt", mimeType: "text/plain", data: "aGk=" }),
    /requires 'full'/,
  );
  await expectThrow(
    "chat_send_message denied when chat=readonly",
    () => executeTool(readonlyAll, "chat_send_message", { email: "u@x.com", spaceName: "spaces/AAA", text: "hi" }),
    /requires 'full'/,
  );

  // 6. All 53 tools are registered in the dispatcher (arg-validation reached,
  //    not "unknown tool"). We call each with empty args and accept any error
  //    except the unknown-tool one.
  const { IMPLEMENTED_TOOLS } = require("../dist/index.js");
  let unknown = 0;
  for (const name of IMPLEMENTED_TOOLS) {
    try {
      await executeTool(r3, name, {});
    } catch (e) {
      if (/Unknown or unimplemented/.test(e.message)) {
        console.error(`✗ ${name} is not wired into dispatch`);
        unknown++;
      }
    }
  }
  if (unknown === 0) {
    console.log(`✓ all ${IMPLEMENTED_TOOLS.length} implemented tools are wired into dispatch`);
  } else {
    failures += unknown;
  }

  if (failures) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll core smoke checks passed.");
})();
