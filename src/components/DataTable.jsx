// src/components/DataTable.jsx
// Komponen tabel terpadu: sort, search, pagination, empty state, loading skeleton

import { useState, useMemo } from 'react';
import { IconChevronUp, IconChevronDown, IconSelector, IconSearch } from '@tabler/icons-react';

/**
 * @param {{
 *   columns: Array<{ key: string, label: string, sortable?: boolean, render?: (row, value) => ReactNode }>,
 *   data: Array<object>,
 *   searchPlaceholder?: string,
 *   searchKeys?: string[],
 *   pageSize?: number,
 *   loading?: boolean,
 *   emptyMessage?: string,
 * }} props
 */
export default function DataTable({
  columns,
  data = [],
  searchPlaceholder = 'Cari...',
  searchKeys = [],
  pageSize = 20,
  loading = false,
  emptyMessage = 'Tidak ada data.',
}) {
  const [search, setSearch]     = useState('');
  const [sortKey, setSortKey]   = useState(null);
  const [sortDir, setSortDir]   = useState('asc'); // 'asc' | 'desc'
  const [page, setPage]         = useState(1);

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
    if (sortKey !== colKey) return <IconSelector size={14} className="text-gray-400" />;
    return sortDir === 'asc'
      ? <IconChevronUp size={14} className="text-blue-600" />
      : <IconChevronDown size={14} className="text-blue-600" />;
  };

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative max-w-full sm:max-w-sm">
        <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder={searchPlaceholder}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-main bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-main overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm data-table">
            <thead>
              <tr className="border-b border-main bg-gray-50 text-xs text-muted">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`p-4 font-semibold ${col.sortable ? 'sortable' : ''}`}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.sortable && <SortIcon colKey={col.key} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-main">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {columns.map((col) => (
                        <td key={col.key} className="p-4">
                          <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : paged.map((row, i) => (
                    <tr key={row.id ?? i} className={`hover:bg-gray-50/60 transition ${row._isNew ? 'animate-highlight' : ''}`}>
                      {columns.map((col) => (
                        <td key={col.key} className="p-4">
                          {col.render ? col.render(row, row[col.key]) : (row[col.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))
              }
              {!loading && paged.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="py-14 text-center text-muted text-sm">
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted pt-1">
          <span>{sorted.length} data ditemukan</span>
          <div className="flex items-center gap-1">
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-2.5 py-1.5 rounded border border-main disabled:opacity-40 hover:bg-gray-100 transition"
            >‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages)
              .map((p, idx, arr) => (
                <>
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span key={`el-${p}`} className="px-1">…</span>}
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-2.5 py-1.5 rounded border transition ${
                      p === currentPage
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                        : 'border-main hover:bg-gray-100'
                    }`}
                  >{p}</button>
                </>
              ))}
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-2.5 py-1.5 rounded border border-main disabled:opacity-40 hover:bg-gray-100 transition"
            >›</button>
          </div>
        </div>
      )}
    </div>
  );
}
