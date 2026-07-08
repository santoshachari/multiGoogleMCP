import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runToolForUser } from "@/lib/toolRunner";

// TEMPORARY Phase-2 verification endpoint — proves the platform can execute a
// real tool from @multigoogle/core against a connected account. Remove once the
// scoped MCP endpoint (Phase 4) supersedes it.
//
//   GET /api/debug/gmail-probe?email=<connected google address>
//
// Runs gmail_search for the newest message and returns the raw tool output.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production." }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json(
      { error: "Pass ?email=<a connected account address>." },
      { status: 400 },
    );
  }

  try {
    const output = await runToolForUser(session.user.id, "gmail_search", {
      email,
      query: req.nextUrl.searchParams.get("q") ?? "",
      maxResults: 1,
    });
    let parsed: unknown = output;
    try {
      parsed = JSON.parse(output);
    } catch {
      // Tool returned a plain-text message (e.g. "No emails found").
    }
    return NextResponse.json({ ok: true, email, output: parsed });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
