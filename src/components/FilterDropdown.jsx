// src/components/FilterDropdown.jsx
// Komponen dropdown filter kustom dengan ikon, menggantikan <select> biasa

import { useState, useRef, useEffect } from 'react';
import { IconChevronDown, IconCheck, IconSearch } from '@tabler/icons-react';

/**
 * @param {{
 *   icon?: React.ElementType,
 *   value: string,
 *   onChange: (value: string) => void,
 *   options: Array<{ value: string, label: string }>,
 *   placeholder?: string,
 *   className?: string,
 *   searchable?: boolean,
 * }} props
 */
export default function FilterDropdown({
  icon: Icon,
  value,
  onChange,
  options = [],
  placeholder = 'Pilih...',
  className = '',
  searchable,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [openUp, setOpenUp] = useState(false);
  const ref = useRef(null);

  const selected = options.find((o) => o.value === value);
  const isFullWidth = className.includes('w-full');
  const isSearchable = searchable !== undefined ? searchable : options.length > 6;

  const filteredOptions = isSearchable && search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleToggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      // Jika ruang di bawah kurang dari 260px dan di atas lebih lega, buka ke atas
      if (spaceBelow < 260 && rect.top > spaceBelow) {
        setOpenUp(true);
      } else {
        setOpenUp(false);
      }
    }
    setOpen((o) => {
      if (o) setSearch('');
      return !o;
    });
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        className={`flex items-center gap-2.5 px-4 py-2.5 text-sm rounded-lg border transition-all font-medium text-left
          ${isFullWidth ? 'w-full justify-between' : 'justify-between'}
          ${open
            ? 'border-blue-500 ring-2 ring-blue-500/20 bg-white text-gray-800'
            : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
          }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
          {Icon && <Icon size={16} className={`flex-shrink-0 ${open ? 'text-blue-600' : 'text-gray-500'}`} />}
          <span className="truncate">{selected?.label ?? placeholder}</span>
        </div>
        <IconChevronDown
          size={15}
          className={`text-gray-400 flex-shrink-0 ml-1.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className={`absolute z-50 ${
            openUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } left-0 ${
            isFullWidth ? 'w-full min-w-full' : 'min-w-[200px]'
          } bg-white border border-gray-200 rounded-xl shadow-xl py-1 flex flex-col`}
          style={{ minWidth: isFullWidth ? '100%' : '200px' }}
        >
          {isSearchable && (
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari pilihan..."
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-md border border-gray-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              </div>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3.5 py-3 text-xs text-gray-400 text-center">Tidak ada pilihan yang cocok</div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`w-full text-left flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs sm:text-sm transition-colors
                    ${value === opt.value
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {value === opt.value && <IconCheck size={14} className="text-blue-600 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
