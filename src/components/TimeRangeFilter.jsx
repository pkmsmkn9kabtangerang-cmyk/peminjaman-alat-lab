import { IconCalendar, IconChevronDown, IconClock } from '@tabler/icons-react';
import { TIME_RANGE_OPTIONS, todayWibDateValue } from '../lib/timeRange';

export default function TimeRangeFilter({
  value,
  onChange,
  options = TIME_RANGE_OPTIONS,
  id = 'rentang-waktu',
  description = 'Berlaku untuk kedua tabel di bawah.',
  className = '',
  dateValue = '',
  onDateChange,
}) {
  const helpId = `${id}-bantuan`;
  const dateId = `${id}-tanggal`;
  const singleOption = options.length === 1;
  const today = todayWibDateValue();

  return (
    <div className={`rounded-2xl border border-main bg-white p-4 shadow-2xs sm:p-5 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <label
            htmlFor={id}
            className="flex items-center gap-1.5 text-sm font-bold text-gray-800"
          >
            <IconClock size={16} />
            Rentang waktu
          </label>
          <p id={helpId} className="mt-1 text-xs text-muted">
            {description}
          </p>
          {dateValue && (
            <p className="mt-1 text-xs font-semibold text-emerald-700">
              Tanggal tertentu aktif dan menggantikan rentang waktu di atas.
            </p>
          )}
        </div>

        {singleOption ? (
          <div className="flex h-12 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-800 sm:w-64">
            <IconClock size={18} />
            {options[0].label}
          </div>
        ) : (
          <div className="relative w-full sm:w-64">
            <select
              id={id}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              aria-describedby={helpId}
              className="h-12 w-full cursor-pointer appearance-none rounded-xl border border-gray-300 bg-white pl-4 pr-10 text-base font-semibold text-gray-800 transition hover:bg-gray-50 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <IconChevronDown
              size={18}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      {onDateChange && (
        <div className="mt-4 flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <label
              htmlFor={dateId}
              className="flex items-center gap-1.5 text-sm font-bold text-gray-800"
            >
              <IconCalendar size={16} />
              Cek tanggal tertentu
            </label>
            <p className="mt-1 text-xs text-muted">
              Pilih satu tanggal untuk melihat data pada hari itu, termasuk tanggal yang sudah lama.
            </p>
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            <input
              id={dateId}
              type="date"
              value={dateValue}
              max={today}
              onChange={(e) => onDateChange(e.target.value)}
              className="h-12 min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-4 text-base font-semibold text-gray-800 transition focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 sm:w-56"
            />
            {dateValue && (
              <button
                type="button"
                onClick={() => onDateChange('')}
                className="h-12 shrink-0 rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
