import { cn } from "@/lib/utils";

function PageHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border-strong bg-navy-900 w-full border-b",
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-12">
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
    <h1 className="font-display text-content-inverse text-3xl">{children}</h1>
  );
}

function PageHeaderDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-content-secondary max-w-prose text-sm">{children}</p>;
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
