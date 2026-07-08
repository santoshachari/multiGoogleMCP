import crypto from "node:crypto";

// API keys are high-entropy random tokens, so a fast hash (SHA-256) is the
// right choice — no need for a slow password hash. We store only the hash and
// a short non-secret prefix; the plaintext is shown to the user exactly once.

export interface GeneratedKey {
  plaintext: string;
  hash: string;
  prefix: string;
}

export function hashApiKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

export function generateApiKey(): GeneratedKey {
  const raw = crypto.randomBytes(24).toString("base64url");
  const plaintext = `mcp_${raw}`;
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    prefix: plaintext.slice(0, 12),
  };
}
