/**
 * NextAuth v5 configuration.
 * Exports: { handlers, auth, signIn, signOut }
 * - handlers → used in src/app/api/auth/[...nextauth]/route.ts
 * - auth     → used in server components and API routes for session access
 * - signIn/signOut → used in client components
 * Extends Session type to include user.id and user.username.
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user?.password) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password,
        );
        if (!valid) return null;

        return user;
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // token.sub is set to user.id automatically
        token.username = (user as { username?: string | null }).username ?? null;
        token.isAdmin = (user as { isAdmin?: boolean }).isAdmin ?? false;
        return token;
      }
      // Refresh isAdmin from DB on token rotation so admin flips take effect
      // without requiring re-login. Skipped when we have no user id yet.
      if (token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { isAdmin: true },
        });
        token.isAdmin = dbUser?.isAdmin ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub!;
      session.user.username = (token.username ?? null) as string | null;
      session.user.isAdmin = Boolean(token.isAdmin);
      return session;
    },
  },
  debug: process.env.NODE_ENV === "development",
  trustHost: true,
});

// Extend the Session and JWT types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      username?: string | null;
      isAdmin: boolean;
    };
  }
}


