"use client";

import { Button } from "@/components/ui/button";
import {
  Pagination as PaginationRoot,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

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
    <PaginationRoot className="mt-8">
      <PaginationContent>
        <PaginationItem>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Go to previous page"
          >
            <ChevronLeftIcon data-icon="inline-start" />
            <span className="hidden sm:block">Prev</span>
          </Button>
        </PaginationItem>

        {pages.map((p, i) => (
          <PaginationItem key={p === "..." ? `dots-${i}` : p}>
            {p === "..." ? (
              <PaginationEllipsis />
            ) : (
              <Button
                variant={p === page ? "outline" : "ghost"}
                size="icon"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? "page" : undefined}
                className="tabular-nums"
              >
                {p}
              </Button>
            )}
          </PaginationItem>
        ))}

        <PaginationItem>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Go to next page"
          >
            <span className="hidden sm:block">Next</span>
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
        </PaginationItem>
      </PaginationContent>
    </PaginationRoot>
  );
}
