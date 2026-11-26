import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange?: (nextPageSize: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
}

export function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  itemLabel = 'items',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(totalItems, safePage * pageSize);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col gap-3 border-t border-[#E4E4E7] pt-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-xs text-[#52525B]">
        Showing{' '}
        <span className="font-mono-tabular font-semibold text-[#18181B]">
          {start}–{end}
        </span>{' '}
        of <span className="font-mono-tabular font-semibold text-[#18181B]">{totalItems}</span>{' '}
        {itemLabel}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {onPageSizeChange && (
          <label className="inline-flex items-center gap-1.5 text-xs text-[#52525B]">
            <span>Rows</span>
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded-lg border border-[#E4E4E7] bg-white px-2 font-mono-tabular text-xs font-medium text-[#18181B] focus:border-[#991B1B] focus:outline-none"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage <= 1}
            aria-label="Previous page"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E4E4E7] bg-white px-2.5 text-xs font-medium text-[#18181B] transition-colors hover:bg-[#F4F5F7] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Previous</span>
          </button>

          <span className="px-2 font-mono-tabular text-xs font-medium text-[#52525B]">
            Page <strong className="text-[#18181B]">{safePage}</strong> / {totalPages}
          </span>

          <button
            type="button"
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= totalPages}
            aria-label="Next page"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E4E4E7] bg-white px-2.5 text-xs font-medium text-[#18181B] transition-colors hover:bg-[#F4F5F7] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span>Next</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </nav>
  );
}
