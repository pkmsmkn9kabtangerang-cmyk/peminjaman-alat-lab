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
    if (sortKey !== colKey) return <IconSelector size={14} className="text-gray-400 opacity-50 group-hover:opacity-100 transition-opacity" />;
    return sortDir === 'asc'
      ? <IconChevronUp size={14} className="text-blue-600" />
      : <IconChevronDown size={14} className="text-blue-600" />;
  };

  return (
    <div className="bg-white rounded-xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] border border-gray-100 overflow-hidden flex flex-col">
      {/* Top Bar: Filters, Search, and Action Button */}
      {(searchKeys.length > 0 || filters || actionButton) && (
        <div className="p-4 sm:p-5 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3 w-full xl:w-auto">
            {filters}
            
            {searchKeys.length > 0 && (
              <div className="relative w-full sm:w-64 shrink-0">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <IconSearch size={16} className="text-gray-400" />
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder={searchPlaceholder}
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-gray-400"
                />
              </div>
            )}
          </div>
          
          <div className="w-full xl:w-auto flex justify-end shrink-0">
            {actionButton}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto min-w-full">
        <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
          <thead>
            <tr className="border-b border-gray-200 bg-white">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-5 py-4 text-[10px] font-bold tracking-wider text-gray-500 uppercase ${col.sortable ? 'cursor-pointer hover:bg-gray-50 group select-none transition-colors' : ''}`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1.5">
                    {col.label}
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
                      <td key={col.key} className="px-5 py-4">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              : paged.map((row, i) => (
                  <tr key={row.id ?? i} className={`hover:bg-gray-50/50 transition-colors duration-150 ${row._isNew ? 'bg-blue-50/30' : 'bg-white'}`}>
                    {columns.map((col) => (
                      <td key={col.key} className="px-5 py-4 align-middle">
                        {col.render ? col.render(row, row[col.key]) : (row[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))
            }
            {!loading && paged.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-16 text-center">
                  <div className="flex flex-col items-center justify-center text-gray-400">
                    <svg className="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
                    <span className="text-sm font-medium">{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Container */}
      <div className="flex justify-end items-center px-6 py-4 text-xs border-t border-gray-100 bg-white">
        <div className="flex items-center gap-6 text-gray-600 font-medium">
          <div className="flex items-center gap-2">
            <span>Data Perhalaman</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="bg-transparent font-bold text-gray-800 focus:outline-none cursor-pointer hover:text-blue-600 transition-colors"
            >
              {[5, 10, 15, 20, 25].map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center gap-3">
            <span>
              {sorted.length > 0 
                ? `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, sorted.length)} of ${sorted.length}`
                : '0 of 0'}
            </span>
            
            {/* Nav Arrows */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="p-1 rounded text-gray-400 hover:text-gray-800 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1 rounded text-gray-400 hover:text-gray-800 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
