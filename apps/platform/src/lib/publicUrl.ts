import type { NextRequest } from "next/server";

// This Next.js build resolves req.url/req.nextUrl.origin from the server's own
// bind address (e.g. http://localhost:3800), not the incoming Host header --
// so behind a reverse proxy every absolute redirect built from it points at
// the wrong host. Set PUBLIC_BASE_URL in production to override; falls back
// to req.nextUrl.origin for local dev where the bind address is correct.
export function publicOrigin(req: NextRequest): string {
  return process.env.PUBLIC_BASE_URL ?? req.nextUrl.origin;
}
