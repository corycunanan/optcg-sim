import { cn } from "@/lib/utils";

function PageHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full bg-navy-900", className)}>
      <div className="mx-auto flex items-center justify-between gap-4 px-6 py-12">
        {children}
      </div>
    </div>
  );
}

function PageHeaderContent({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}

function PageHeaderTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-display text-3xl font-bold tracking-tight text-content-inverse">
      {children}
    </h1>
  );
}

function PageHeaderDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-navy-200">{children}</p>;
}

function PageHeaderActions({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
}

export {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderActions,
};
