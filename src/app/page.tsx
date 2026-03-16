export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">OPTCG Simulator</h1>
        <p className="mb-8 text-lg text-gray-600">
          One Piece Trading Card Game — Deck Builder & Simulator
        </p>
        <div className="flex gap-4">
          <a
            href="/admin/cards"
            className="rounded-lg bg-red-600 px-6 py-3 text-white transition hover:bg-red-700"
          >
            Card Database
          </a>
          <a
            href="/login"
            className="rounded-lg border border-gray-300 px-6 py-3 transition hover:bg-gray-50"
          >
            Sign In
          </a>
        </div>
      </div>
    </main>
  );
}
