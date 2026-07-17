import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
  if (total <= limit) return null;
  const first = page * limit + 1;
  const last = Math.min((page + 1) * limit, total);
  const buttonClass =
    "rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="mt-4 flex items-center justify-center gap-4 text-sm text-zinc-400">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 0}
        className={buttonClass}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <span>
        {first}–{last} of {total}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={last >= total}
        className={buttonClass}
        aria-label="Next page"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
