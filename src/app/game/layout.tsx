export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="fixed inset-0 z-50 overflow-hidden bg-gb-board">{children}</div>;
}
