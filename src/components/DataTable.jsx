// src/components/DataTable.jsx
// Komponen tabel terpadu berstandar SaaS: sort, search, pagination, responsive 320px - 1024px+

import { useState, useMemo } from 'react';
import {
  IconChevronUp,
  IconChevronDown,
  IconSelector,
  IconSearch,
  IconX,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';

/**
 * @param {{
 *   columns: Array<{ key: string, label: string, sortable?: boolean, render?: (row, value) => ReactNode }>,
 *   data: Array<object>,
 *   searchPlaceholder?: string,
 *   searchKeys?: string[],
 *   defaultPageSize?: number,
 *   loading?: boolean,
 *   emptyMessage?: string,
 *   filters?: ReactNode,
 *   actionButton?: ReactNode
 * }} props
 */
export default function DataTable({
  columns,
  data = [],
  searchPlaceholder = 'Cari...',
  searchKeys = [],
  defaultPageSize = 5,
  loading = false,
  emptyMessage = 'Tidak ada data.',
  filters,
  actionButton,
}) {
  const [search, setSearch]     = useState('');
  const [sortKey, setSortKey]   = useState(null);
  const [sortDir, setSortDir]   = useState('asc'); // 'asc' | 'desc'
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // Filter
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      searchKeys.some((k) => String(row[k] ?? '').toLowerCase().includes(q))
    );
  }, [data, search, searchKeys]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      const cmp = String(va).localeCompare(String(vb), 'id', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // Paginate
  const totalPages  = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged       = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const SortIcon = ({ colKey }) => {
    if (sortKey !== colKey) {
      return (
        <IconSelector
          size={14}
          className="text-gray-400 opacity-60 group-hover:opacity-100 transition-opacity"
        />
      );
    }
    return sortDir === 'asc' ? (
      <IconChevronUp size={14} className="text-blue-600" />
    ) : (
      <IconChevronDown size={14} className="text-blue-600" />
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-xs border border-gray-200/80 overflow-hidden flex flex-col">
      {/* Top Bar: Filters, Search, and Action Button */}
      {(searchKeys.length > 0 || filters || actionButton) && (
        <div className="p-3 sm:p-4 lg:p-5 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 border-b border-gray-100 bg-white">
          {/* Left / Top Controls: Filters + Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto flex-wrap">
            {filters}

            {searchKeys.length > 0 && (
              <div className="relative w-full sm:w-64 shrink-0">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <IconSearch size={16} />
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full pl-9 pr-8 h-10 text-xs sm:text-sm rounded-lg border border-gray-300/90 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-gray-400 font-medium"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setPage(1);
                    }}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600 transition"
                    title="Hapus pencarian"
                  >
                    <IconX size={14} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right Action Button */}
          {actionButton && (
            <div className="w-full md:w-auto flex items-stretch sm:items-center justify-stretch md:justify-end shrink-0">
              {actionButton}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto min-w-full">
        <table className="w-full text-left text-xs sm:text-sm whitespace-nowrap min-w-max">
          <thead>
            <tr className="border-b border-gray-200/80 bg-gray-50/60">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3.5 sm:px-5 py-3 sm:py-3.5 text-[10px] sm:text-xs font-bold tracking-wider text-gray-500 uppercase ${
                    col.sortable
                      ? 'cursor-pointer hover:bg-gray-100/70 group select-none transition-colors'
                      : ''
                  }`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{col.label}</span>
                    {col.sortable && <SortIcon colKey={col.key} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-700">
            {loading
              ? Array.from({ length: pageSize }).map((_, i) => (
                  <tr key={i}>
                    {columns.map((col) => (
                      <td key={col.key} className="px-3.5 sm:px-5 py-3 sm:py-3.5">
                        <div
                          className="h-4 bg-gray-100 rounded-md animate-pulse"
                          style={{ width: `${40 + Math.random() * 40}%` }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : paged.map((row, i) => (
                  <tr
                    key={row.id ?? i}
                    className={`transition-all duration-300 ${
                      row._isNew
                        ? 'bg-emerald-50/90 font-medium border-l-4 border-l-emerald-500 shadow-xs'
                        : 'bg-white hover:bg-blue-50/30'
                    }`}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className="px-3.5 sm:px-5 py-3 sm:py-3.5 align-middle"
                      >
                        {col.render
                          ? col.render(row, row[col.key])
                          : (row[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
            {!loading && paged.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-14 text-center">
                  <div className="flex flex-col items-center justify-center text-gray-400">
                    <svg
                      className="w-12 h-12 mb-2.5 opacity-25"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.7"
                        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                      />
                    </svg>
                    <span className="text-xs sm:text-sm font-medium text-gray-500">
                      {emptyMessage}
                    </span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Container - Optimized for 320px to 1024px+ */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3.5 sm:px-6 py-3 sm:py-3.5 text-xs border-t border-gray-100 bg-white text-gray-600 font-medium">
        {/* Left: Row per page selector */}
        <div className="flex items-center justify-between sm:justify-start w-full sm:w-auto gap-2">
          <span className="text-gray-500 text-[11px] sm:text-xs">Baris per halaman:</span>
          <div className="relative">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="appearance-none bg-gray-50 hover:bg-gray-100 border border-gray-200/90 pl-2.5 pr-6 py-1 rounded-md font-semibold text-gray-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer transition-colors"
            >
              {[5, 10, 15, 20, 25].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <IconChevronDown
              size={12}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
          </div>
        </div>

        {/* Right: Info and Navigation */}
        <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-3 sm:gap-4">
          <span className="text-[11px] sm:text-xs text-gray-500">
            {sorted.length > 0
              ? `${(currentPage - 1) * pageSize + 1}-${Math.min(
                  currentPage * pageSize,
                  sorted.length
                )} dari ${sorted.length}`
              : '0 dari 0'}
          </span>

          <div className="flex items-center gap-1">
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-gray-800 hover:bg-gray-50 disabled:opacity-30 disabled:pointer-events-none shadow-xs transition-colors"
              title="Halaman Sebelumnya"
              aria-label="Halaman Sebelumnya"
            >
              <IconChevronLeft size={14} />
            </button>
            <span className="px-1.5 text-[11px] sm:text-xs font-semibold text-gray-700 min-w-[20px] text-center">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-gray-800 hover:bg-gray-50 disabled:opacity-30 disabled:pointer-events-none shadow-xs transition-colors"
              title="Halaman Selanjutnya"
              aria-label="Halaman Selanjutnya"
            >
              <IconChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

