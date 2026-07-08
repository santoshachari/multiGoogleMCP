import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

// Platform login only. This Google provider requests basic identity scopes
// (openid, email, profile) purely to authenticate the person using the app.
//
// It is deliberately separate from the "connected accounts" flow (Phase 1),
// which runs its own Google OAuth to request Gmail/Calendar/Drive/Chat scopes
// and stores encrypted refresh tokens in ConnectedAccount.
//
// Auth.js v5 reads AUTH_SECRET, AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET from the
// environment automatically.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  session: { strategy: "database" },
  pages: { signIn: "/" },
  callbacks: {
    // With the database session strategy, `user` is the DB row. Surface its id
    // on the session so route handlers can attribute connected accounts.
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});
