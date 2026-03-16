import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      {/* Admin nav */}
      <nav className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <Link href="/" className="text-lg font-bold text-red-600">
            OPTCG
          </Link>
          <div className="flex gap-4 text-sm">
            <Link
              href="/admin/cards"
              className="text-gray-700 hover:text-gray-900"
            >
              Cards
            </Link>
            <Link
              href="/admin/sets"
              className="text-gray-700 hover:text-gray-900"
            >
              Sets
            </Link>
          </div>
          <div className="ml-auto text-xs text-gray-400">Admin</div>
        </div>
      </nav>

      {/* Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
