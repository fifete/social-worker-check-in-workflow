import { useState } from 'react';

export default function Zone2Search({ isDisabled = false, onSearchChange }) {
  const [query, setQuery] = useState('');

  const handleChange = (event) => {
    const nextQuery = event.target.value;
    setQuery(nextQuery);
    onSearchChange?.(nextQuery);
  };

  const handleClear = () => {
    setQuery('');
    onSearchChange?.('');
  };

  return (
    <div className={`w-full px-4 py-3 bg-white shadow-sm flex items-center gap-2 ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <input
        type="text"
        inputMode="text"
        value={query}
        onChange={handleChange}
        placeholder="Buscar por DNI o Apellidos..."
        disabled={isDisabled}
        className="min-h-[48px] flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-lg font-semibold text-brand-slate outline-none focus:border-brand-emerald"
      />

      <button
        type="button"
        onClick={handleClear}
        disabled={isDisabled}
        className="min-h-[56px] min-w-[56px] rounded-full border border-slate-200 bg-white p-3 text-xl font-bold text-brand-slate disabled:cursor-not-allowed"
      >
        X
      </button>
    </div>
  );
}
