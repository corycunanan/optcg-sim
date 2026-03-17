"use client";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
}: PaginationProps) {
  const pages: (number | "...")[] = [];

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");

    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);

    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <div className="mt-8 flex items-center justify-center gap-1">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="rounded-md px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30"
        style={{
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
        }}
      >
        Prev
      </button>

      {pages.map((p, i) =>
        p === "..." ? (
          <span
            key={`dots-${i}`}
            className="px-2 text-sm"
            style={{ color: "var(--text-tertiary)" }}
          >
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className="rounded-md px-3 py-1.5 text-sm font-medium tabular-nums transition-colors"
            style={
              p === page
                ? {
                    background: "var(--accent)",
                    color: "var(--surface-0)",
                  }
                : {
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                  }
            }
          >
            {p}
          </button>
        ),
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="rounded-md px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30"
        style={{
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
        }}
      >
        Next
      </button>
    </div>
  );
}
