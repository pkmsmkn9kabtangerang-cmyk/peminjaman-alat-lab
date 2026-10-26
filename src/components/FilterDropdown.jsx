// src/components/FilterDropdown.jsx
// Komponen dropdown filter kustom dengan ikon, menggantikan <select> biasa.

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
 *   size?: 'md' | 'lg',
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
  size = 'md',
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [openUp, setOpenUp] = useState(false);
  const ref = useRef(null);

  const selected = options.find((o) => o.value === value);
  const isFullWidth = className.includes('w-full');
  const isSearchable = searchable !== undefined ? searchable : options.length > 6;
  const isLg = size === 'lg';

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
    document.addEventListener('touchstart', handler, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  const handleToggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      // Jika ruang di bawah kurang dari 280px dan di atas lebih lega, buka ke atas.
      setOpenUp(spaceBelow < 280 && rect.top > spaceBelow);
    }
    setOpen((o) => {
      if (o) setSearch('');
      return !o;
    });
  };

  const buttonSizeClass = isLg
    ? 'min-h-12 px-4 text-[14px] rounded-xl'
    : 'min-h-11 px-3.5 text-[13px] rounded-lg sm:px-4 sm:text-sm';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-2.5 ${buttonSizeClass} w-full justify-between border font-medium text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          open
            ? 'border-blue-500 bg-white text-gray-800 ring-2 ring-blue-500/20'
            : 'border-gray-300/90 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5 overflow-hidden">
          {Icon && (
            <Icon
              size={isLg ? 19 : 16}
              className={`flex-shrink-0 ${open ? 'text-blue-600' : 'text-gray-500'}`}
            />
          )}
          <span className={`truncate ${!selected ? 'font-normal text-gray-400' : 'font-medium text-gray-800'}`}>
            {selected?.label ?? placeholder}
          </span>
        </div>
        <IconChevronDown
          size={isLg ? 18 : 15}
          className={`ml-1.5 flex-shrink-0 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={placeholder}
          className={`absolute z-50 ${
            openUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } left-0 w-full ${
            isFullWidth ? 'min-w-full' : 'min-w-[190px] sm:w-auto'
          } max-w-[calc(100vw-2rem)] animate-fadeIn rounded-xl border border-gray-200 bg-white py-1 shadow-xl`}
          style={{ minWidth: isFullWidth ? '100%' : undefined }}
        >
          {isSearchable && (
            <div className="border-b border-gray-100 p-2">
              <div className="relative">
                <IconSearch
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari pilihan..."
                  aria-label="Cari pilihan"
                  className="min-h-10 w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-2.5 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              </div>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto overscroll-contain py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3.5 py-3 text-center text-[12.5px] text-gray-400">
                Tidak ada pilihan yang cocok
              </div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={value === opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-[13px] transition-colors sm:text-sm ${
                    value === opt.value
                      ? 'bg-blue-50 font-semibold text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {value === opt.value && <IconCheck size={14} className="flex-shrink-0 text-blue-600" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
