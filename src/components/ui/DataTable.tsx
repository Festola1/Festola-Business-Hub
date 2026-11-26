import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { EmptyState, LoadingSkeleton } from './Feedback';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  sortValue?: (row: T) => string | number;
  render: (row: T) => ReactNode;
  widthClass?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  skeletonRows?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  caption?: string;
  initialSortKey?: string;
  initialSortDir?: 'asc' | 'desc';
  onRowClick?: (row: T) => void;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  skeletonRows = 5,
  emptyTitle = 'No records found',
  emptyDescription = 'Records will appear here as soon as activity is logged.',
  emptyAction,
  caption,
  initialSortKey,
  initialSortDir = 'asc',
  onRowClick,
  className = '',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(initialSortKey ?? null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSortDir);

  const sortedRows = useMemo(() => {
    if (!sortKey) {
      return rows;
    }
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) {
      return rows;
    }
    const extractor = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = extractor(a);
      const vb = extractor(b);
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [columns, rows, sortDir, sortKey]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  if (loading) {
    return (
      <LoadingSkeleton
        rows={skeletonRows}
        label={caption ? `Loading ${caption}...` : 'Loading table...'}
      />
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-[#E4E4E7] text-xs font-semibold text-[#52525B]">
            {columns.map((col) => {
              const alignClass =
                col.align === 'right'
                  ? 'text-right'
                  : col.align === 'center'
                    ? 'text-center'
                    : 'text-left';
              const isSorted = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    col.sortValue
                      ? isSorted
                        ? sortDir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                      : undefined
                  }
                  className={`py-2.5 px-3 font-semibold whitespace-nowrap ${alignClass} ${col.widthClass ?? ''}`}
                >
                  {col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={`inline-flex items-center gap-1 text-xs font-semibold text-[#52525B] transition-colors hover:text-[#18181B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#991B1B] ${
                        col.align === 'right' ? 'flex-row-reverse' : ''
                      }`}
                    >
                      <span>{col.header}</span>
                      {isSorted ? (
                        sortDir === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5 text-[#991B1B]" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5 text-[#991B1B]" aria-hidden="true" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F1F5F9]">
          {sortedRows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`min-h-[42px] transition-colors hover:bg-[#F8F8FA] ${
                onRowClick ? 'cursor-pointer' : ''
              }`}
            >
              {columns.map((col) => {
                const alignClass =
                  col.align === 'right'
                    ? 'text-right font-mono-tabular'
                    : col.align === 'center'
                      ? 'text-center'
                      : 'text-left';
                return (
                  <td
                    key={col.key}
                    className={`py-3 px-3 text-[13px] text-[#18181B] ${alignClass}`}
                  >
                    {col.render(row)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
