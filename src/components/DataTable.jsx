import { useState, useMemo } from 'react';
import {
  IconChevronUp,
  IconChevronDown,
  IconSelector,
  IconSearch,
  IconX,
  IconChevronLeft,
  IconChevronRight,
  IconDatabaseOff,
} from '@tabler/icons-react';

const PAGE_SIZE_OPTIONS = [5, 10, 15, 25, 50];

export default function DataTable({
  columns,
  data = [],
  searchPlaceholder = 'Cari...',
  searchKeys = [],
  defaultPageSize = 10,
  loading = false,
  emptyMessage = 'Belum ada data yang masuk',
  emptyDescription = 'Data yang masuk akan muncul di sini.',
  filters,
  actionButton,
}) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      searchKeys.some((k) => String(row[k] ?? '').toLowerCase().includes(q))
    );
  }, [data, search, searchKeys]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      const cmp = String(va).localeCompare(String(vb), 'id', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const hasSearch = search.trim().length > 0;
  const emptyTitle = hasSearch ? 'Data tidak ditemukan' : emptyMessage;
  const emptyHint = hasSearch ? 'Coba gunakan kata kunci lain.' : emptyDescription;

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const getCell = (row, col) =>
    col.render ? col.render(row, row[col.key]) : (row[col.key] ?? '—');

  const SortIcon = ({ colKey }) => {
    if (sortKey !== colKey) {
      return <IconSelector size={16} className="text-gray-400" />;
    }
    return sortDir === 'asc' ? (
      <IconChevronUp size={16} className="text-blue-800" />
    ) : (
      <IconChevronDown size={16} className="text-blue-800" />
    );
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-main bg-white shadow-sm">
      {(searchKeys.length > 0 || filters || actionButton) && (
        <div className="flex flex-col justify-between gap-2.5 border-b border-main bg-white p-3 sm:p-4 md:flex-row md:items-center">
          <div className="flex w-full flex-col items-stretch gap-2.5 sm:flex-row sm:flex-wrap sm:items-center md:w-auto">
            {filters}

            {searchKeys.length > 0 && (
              <div className="relative w-full shrink-0 sm:w-72">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                  <IconSearch size={18} />
                </div>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-10 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setPage(1);
                    }}
                    className="absolute inset-y-0 right-0 flex min-w-10 items-center justify-center pr-2 text-gray-500 transition hover:text-gray-800"
                    title="Hapus pencarian"
                    aria-label="Hapus pencarian"
                  >
                    <IconX size={16} />
                  </button>
                )}
              </div>
            )}
          </div>

          {actionButton && (
            <div className="flex w-full shrink-0 items-stretch justify-stretch md:w-auto md:items-center md:justify-end">
              {actionButton}
            </div>
          )}
        </div>
      )}

      {/* ── Tampilan tabel: tablet & desktop ─────────────────── */}
      <div className="hidden overflow-x-auto md:block">
        <table className="data-table w-full min-w-max text-left text-[14px]">
          <thead>
            <tr className="border-b border-main bg-gray-50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-[13px] font-semibold text-gray-700 ${
                    col.sortable ? 'group cursor-pointer select-none hover:bg-gray-100' : ''
                  }`}
                  onClick={() => col.sortable && handleSort(col.key)}
                  aria-sort={col.sortable && sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <span>{col.label}</span>
                    {col.sortable && <SortIcon colKey={col.key} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 text-gray-800">
            {loading
              ? Array.from({ length: Math.min(pageSize, 6) }).map((_, i) => (
                  <tr key={i}>
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-4">
                        <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
                      </td>
                    ))}
                  </tr>
                ))
              : paged.map((row, i) => (
                  <tr
                    key={row.id ?? i}
                    className={row._isNew ? 'bg-blue-50 font-medium' : 'bg-white hover:bg-gray-50'}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3.5 align-middle">
                        {getCell(row, col)}
                      </td>
                    ))}
                  </tr>
                ))}
            {!loading && paged.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-6 py-14 text-center">
                  <EmptyState title={emptyTitle} hint={emptyHint} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Tampilan kartu: ponsel ────────────────────────────── */}
      <div className="divide-y divide-gray-200 md:hidden">
        {loading
          ? Array.from({ length: Math.min(pageSize, 4) }).map((_, i) => (
              <div key={i} className="space-y-2.5 p-3.5">
                <div className="h-4 w-1/2 animate-pulse rounded bg-gray-100" />
                <div className="h-3.5 w-3/4 animate-pulse rounded bg-gray-100" />
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-gray-100" />
              </div>
            ))
          : paged.map((row, i) => (
              <div
                key={row.id ?? i}
                className={`p-3.5 ${row._isNew ? 'bg-blue-50/80' : 'bg-white'}`}
              >
                <dl className="divide-y divide-gray-100">
                  {columns
                    .filter((col) => col.key !== 'aksi')
                    .map((col) => (
                      <div key={col.key} className="flex items-start justify-between gap-3 py-1.5 first:pt-0">
                        {col.label ? (
                          <dt className="shrink-0 pt-0.5 text-[11.5px] font-medium uppercase tracking-[0.04em] text-gray-500">
                            {col.label}
                          </dt>
                        ) : (
                          <dt />
                        )}
                        <dd className="min-w-0 break-words text-right text-[13px] font-medium text-gray-800">
                          {getCell(row, col)}
                        </dd>
                      </div>
                    ))}
                </dl>

                {columns.some((col) => col.key === 'aksi') && (
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-1 border-t border-gray-100 pt-2">
                    {getCell(row, columns.find((col) => col.key === 'aksi'))}
                  </div>
                )}
              </div>
            ))}
        {!loading && paged.length === 0 && (
          <div className="px-5 py-10 text-center">
            <EmptyState title={emptyTitle} hint={emptyHint} />
          </div>
        )}
      </div>

      <div className="flex flex-col items-center justify-between gap-2.5 border-t border-main bg-white px-3 py-3 text-[12.5px] text-gray-700 sm:flex-row sm:px-4">
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
          <span className="whitespace-nowrap text-muted">Baris per halaman</span>
          <div className="relative inline-flex items-center">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              aria-label="Jumlah baris per halaman"
              className="h-11 cursor-pointer appearance-none rounded-lg border border-gray-300 bg-white pl-2.5 pr-7 text-[13px] font-medium text-gray-800 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1.5 text-gray-500">
              <IconChevronDown size={14} />
            </div>
          </div>
        </div>

        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-3">
          <span className="whitespace-nowrap text-muted" aria-live="polite">
            {sorted.length > 0
              ? `${(currentPage - 1) * pageSize + 1}–${Math.min(
                  currentPage * pageSize,
                  sorted.length
                )} dari ${sorted.length}`
              : '0 dari 0'}
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="flex h-11 min-w-11 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-40"
              title="Halaman sebelumnya"
              aria-label="Halaman sebelumnya"
            >
              <IconChevronLeft size={17} />
            </button>
            <span className="min-w-[52px] px-1 text-center text-[12.5px] font-semibold text-gray-800">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="flex h-11 min-w-11 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-40"
              title="Halaman selanjutnya"
              aria-label="Halaman selanjutnya"
            >
              <IconChevronRight size={17} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, hint }) {
  return (
    <>
      <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <IconDatabaseOff size={21} />
      </span>
      <p className="text-[14px] font-semibold text-main">{title}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{hint}</p>
    </>
  );
}
