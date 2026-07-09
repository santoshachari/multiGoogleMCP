import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Platform login: email + password only (no Google sign-in for the app
// itself). This is unrelated to the "connect a Google account" flow
// (src/app/api/connect/google/*), which is a separate OAuth pass requesting
// Gmail/Calendar/Drive/Chat scopes and storing encrypted refresh tokens in
// ConnectedAccount — a user can have zero, one, or many connected Google
// accounts regardless of how they logged into the app.
//
// The Credentials provider requires the JWT session strategy (no adapter):
// there's no OAuth account for an adapter to persist/link, so the user id is
// carried in the signed JWT instead of a Session table row.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/" },
  // Auth.js only auto-trusts the request Host header in dev mode. Running as
  // a production `next start` service (see README "Running as a background
  // service") on a non-default port otherwise fails every auth request with
  // UntrustedHost. This app is self-hosted for a known set of users behind no
  // reverse proxy, so trusting the host here is the standard, safe opt-in —
  // see https://errors.authjs.dev#untrustedhost.
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
      }
      return session;
    },
  },
});
