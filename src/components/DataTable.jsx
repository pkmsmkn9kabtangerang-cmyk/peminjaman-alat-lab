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
    <div className="bg-white border border-main overflow-hidden flex flex-col">
      {(searchKeys.length > 0 || filters || actionButton) && (
        <div className="p-3 sm:p-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 border-b border-main bg-white">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto flex-wrap">
            {filters}

            {searchKeys.length > 0 && (
              <div className="relative w-full sm:w-72 shrink-0">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
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
                  className="w-full pl-10 pr-9 h-11 text-[15px] rounded border border-gray-300 bg-white focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 placeholder:text-gray-400"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setPage(1);
                    }}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-500 hover:text-gray-800 min-w-10"
                    title="Hapus pencarian"
                  >
                    <IconX size={16} />
                  </button>
                )}
              </div>
            )}
          </div>

          {actionButton && (
            <div className="w-full md:w-auto flex items-stretch sm:items-center justify-stretch md:justify-end shrink-0">
              {actionButton}
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto min-w-full">
        <table className="w-full text-left text-[15px] min-w-max">
          <thead>
            <tr className="border-b border-main bg-gray-50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-[15px] font-semibold text-gray-700 ${col.sortable ? 'cursor-pointer hover:bg-gray-100 group select-none' : ''
                    }`}
                  onClick={() => col.sortable && handleSort(col.key)}
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
                      <div className="h-4 bg-gray-100 rounded w-2/3" />
                    </td>
                  ))}
                </tr>
              ))
              : paged.map((row, i) => (
                <tr
                  key={row.id ?? i}
                  className={`${row._isNew
                    ? 'bg-blue-50 font-medium'
                    : 'bg-white hover:bg-gray-50'
                    }`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="px-4 py-3.5 align-middle"
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
                <td colSpan={columns.length} className="py-14 text-center px-6">
                  <p className="text-base font-semibold text-main">{emptyTitle}</p>
                  <p className="text-[15px] text-muted mt-1">{emptyHint}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 text-[15px] border-t border-main bg-white text-gray-700">
        <div className="flex items-center justify-between sm:justify-start w-full sm:w-auto gap-2">
          <span className="text-muted">Baris per halaman</span>
          <div className="relative inline-flex items-center">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="bg-white border border-gray-300 pl-3 pr-7 py-1.5 rounded font-medium text-gray-800 text-[15px] min-h-10 focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700 appearance-none cursor-pointer"
            >
              {[5, 10, 15, 20, 25].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-gray-500">
              <IconChevronDown size={14} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-3">
          <span className="text-muted">
            {sorted.length > 0
              ? `${(currentPage - 1) * pageSize + 1}–${Math.min(
                currentPage * pageSize,
                sorted.length
              )} dari ${sorted.length}`
              : '0 dari 0'}
          </span>

          <div className="flex items-center gap-1">
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 min-h-10 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
              title="Halaman sebelumnya"
              aria-label="Halaman sebelumnya"
            >
              <IconChevronLeft size={18} />
            </button>
            <span className="px-2 font-medium text-gray-800 min-w-[48px] text-center">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 min-h-10 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
              title="Halaman selanjutnya"
              aria-label="Halaman selanjutnya"
            >
              <IconChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
