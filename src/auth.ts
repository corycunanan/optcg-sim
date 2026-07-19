/**
 * NextAuth v5 configuration.
 * Exports: { handlers, auth, signIn, signOut }
 * - handlers → used in src/app/api/auth/[...nextauth]/route.ts
 * - auth     → used in server components and API routes for session access
 * - signIn/signOut → used in client components
 * Extends Session type to include user.id and user.username.
 */
import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export function hasAuthSecret() {
  return Boolean(process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET);
}

export const authConfig = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
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
        if (
          typeof credentials?.email !== "string" ||
          typeof credentials.password !== "string"
        ) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user?.password) return null;

        const valid = await bcrypt.compare(credentials.password, user.password);
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
        token.username = user.username ?? null;
        token.isAdmin = user.isAdmin ?? false;
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
      session.user.username =
        typeof token.username === "string" ? token.username : null;
      session.user.isAdmin = Boolean(token.isAdmin);
      return session;
    },
  },
  debug: process.env.NODE_ENV === "development",
  // Vercel Preview deployments use a different *.vercel.app hostname per
  // branch. Vercel supplies the trusted forwarded-host headers for these URLs.
  trustHost: true,
} satisfies NextAuthConfig;

const nextAuth = NextAuth(authConfig);

type AuthRequest = Parameters<typeof nextAuth.handlers.GET>[0];

function missingSecretResponse(request: AuthRequest) {
  const action = new URL(request.url).pathname.split("/").pop();

  // SessionProvider polls this endpoint. Returning a signed-out session keeps
  // a missing Preview-scope secret from causing a client-side error loop.
  if (request.method === "GET" && action === "session") {
    return Response.json(null);
  }

  return Response.json(
    { message: "Authentication is temporarily unavailable." },
    { status: 503 }
  );
}

export const handlers = {
  GET(request: AuthRequest) {
    return hasAuthSecret()
      ? nextAuth.handlers.GET(request)
      : missingSecretResponse(request);
  },
  POST(request: AuthRequest) {
    return hasAuthSecret()
      ? nextAuth.handlers.POST(request)
      : missingSecretResponse(request);
  },
};

export const auth = ((...args: unknown[]) => {
  // Auth.js returns its configuration-error JSON body from auth() as a truthy
  // value. Treat only the known missing-secret state as signed out so server
  // components redirect to /login instead of bouncing between protected pages.
  if (args.length === 0 && !hasAuthSecret()) {
    return Promise.resolve(null);
  }

  return Reflect.apply(nextAuth.auth, undefined, args);
}) as typeof nextAuth.auth;

export const { signIn, signOut } = nextAuth;

// Extend the Session and JWT types
declare module "next-auth" {
  interface User {
    username?: string | null;
    isAdmin?: boolean;
  }

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
