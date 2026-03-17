import Link from "next/link";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{
        background: "var(--surface-0)",
        color: "var(--text-primary)",
      }}
    >
      {/* Admin nav */}
      <nav
        className="sticky top-0 z-10"
        style={{
          background: "var(--surface-1)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-8 px-6">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight"
            style={{ color: "var(--accent)" }}
          >
            OPTCG
          </Link>
          <div className="flex gap-1">
            <NavLink href="/admin" label="Dashboard" />
            <NavLink href="/admin/cards" label="Cards" />
            <NavLink href="/admin/sets" label="Sets" />
            <NavLink href="/decks" label="My Decks" />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/admin/cards/new"
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: "var(--accent)",
                color: "var(--surface-0)",
              }}
            >
              + Add Card
            </Link>

            {session?.user && (
              <div className="flex items-center gap-2.5">
                {/* Avatar */}
                {session.user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.image}
                    alt=""
                    className="h-7 w-7 rounded-full"
                    style={{ border: "1px solid var(--border)" }}
                  />
                ) : (
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      background: "var(--accent)",
                      color: "var(--surface-0)",
                    }}
                  >
                    {(session.user.username || session.user.name || "?")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}

                {/* Username / name */}
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {session.user.username || session.user.name || session.user.email}
                </span>

                <SignOutButton />
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/5"
      style={{ color: "var(--text-secondary)" }}
    >
      {label}
    </Link>
  );
}
