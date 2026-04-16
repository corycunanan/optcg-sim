import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/admin");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-content-primary">
      {children}
    </div>
  );
}
