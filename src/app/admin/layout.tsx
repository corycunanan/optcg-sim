export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 overflow-y-auto bg-background text-content-primary">
      <main className="mx-auto w-full max-w-7xl px-6 py-8">
        {children}
      </main>
    </div>
  );
}
