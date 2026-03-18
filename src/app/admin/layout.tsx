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
    <div className="flex min-h-screen flex-col bg-background text-content-primary">
      {/* Admin nav */}
      <nav className="sticky top-0 z-10 border-b border-navy-700 bg-navy-900">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-8 px-6">
          <Link
            href="/"
            className="font-display text-lg font-bold tracking-tight text-content-inverse"
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
              className="rounded-md bg-gold-500 px-3 py-2 text-xs font-medium text-navy-900 transition-colors hover:bg-gold-400"
            >
              + Add Card
            </Link>

            {session?.user && (
              <div className="flex items-center gap-2">
                {/* Avatar */}
                {session.user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.image}
                    alt=""
                    className="h-7 w-7 rounded-full border border-navy-700"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-500 text-xs font-bold text-navy-900">
                    {(session.user.username || session.user.name || "?")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}

                {/* Username / name */}
                <span className="text-xs font-medium text-content-inverse/70">
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
      className="rounded px-3 py-2 text-sm font-medium text-content-inverse/70 transition-colors hover:bg-navy-800 hover:text-content-inverse"
    >
      {label}
    </Link>
  );
}
