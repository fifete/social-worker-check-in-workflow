import { useState, useEffect, useRef, useCallback } from 'react';
import * as visitorService from '../services/visitorService.js';

function normalize(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export default function Zone2Search({
  appFlowState,
  send,
  prefillSearch,
  onPrefillConsumed,
}) {
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState([]);
  const [rawCount, setRawCount]   = useState(0);
  const [noResults, setNoResults] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const debounceRef = useRef(null);
  const inputRef    = useRef(null);

  // ── Consume prefill from barcode not-found path ───────────────────────────
  useEffect(() => {
    if (prefillSearch) {
      setQuery(prefillSearch);
      onPrefillConsumed();
      // let useEffect below trigger the search
    }
  }, [prefillSearch, onPrefillConsumed]);

  // ── Reset on READY_EMPTY ──────────────────────────────────────────────────
  useEffect(() => {
    if (appFlowState === 'READY_EMPTY') {
      setQuery('');
      setResults([]);
      setRawCount(0);
      setNoResults(false);
      setSearchError(null);
    }
  }, [appFlowState]);

  // ── Focus input on READY_EMPTY entry ────────────────────────────────────
  useEffect(() => {
    if (appFlowState === 'READY_EMPTY' && inputRef.current) {
      // Small delay to avoid fighting with animation
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [appFlowState]);

  // ── Search execution ─────────────────────────────────────────────────────
  const runSearch = useCallback(async (q) => {
    const trimmed = q.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setRawCount(0);
      setNoResults(false);
      setSearchError(null);
      if (trimmed.length === 0 && (appFlowState === 'MULTI_MATCH')) {
        send({ type: 'SEARCH_CLEARED' });
      }
      return;
    }

    try {
      const all = await visitorService.searchVisitors(trimmed);
      setSearchError(null);

      if (all.length === 0) {
        setResults([]);
        setRawCount(0);
        setNoResults(true);
        send({ type: 'SEARCH_NO_RESULTS' });
      } else if (all.length === 1) {
        setResults([]);
        setRawCount(1);
        setNoResults(false);
        send({ type: 'SEARCH_RESULT_SINGLE', visitor: all[0] });
      } else {
        setRawCount(all.length);
        setResults(all.slice(0, 15));
        setNoResults(false);
        send({ type: 'SEARCH_RESULTS_MULTIPLE' });
      }
    } catch {
      setSearchError('Error al buscar. Intente de nuevo.');
    }
  }, [appFlowState, send]);

  // ── Debounced query effect ────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(debounceRef.current);
    const trimmed = query.trim();

    if (trimmed.length < 3) {
      if (trimmed.length === 0 && appFlowState === 'MULTI_MATCH') {
        send({ type: 'SEARCH_CLEARED' });
      }
      setResults([]);
      setNoResults(false);
      setSearchError(null);
      return;
    }

    debounceRef.current = setTimeout(() => runSearch(query), 150);
    return () => clearTimeout(debounceRef.current);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleInput(e) {
    setQuery(e.target.value);
  }

  function handleRowTap(visitor) {
    send({ type: 'VISITOR_SELECTED', visitor });
  }

  const showList = appFlowState === 'MULTI_MATCH' && results.length > 0;

  return (
    <div className="flex flex-col h-full px-4 pt-3 pb-2 gap-2"
      style={{ background: 'var(--color-bg-page)', borderTop: '1px solid var(--color-border)' }}>

      {/* Search input */}
      <input
        ref={inputRef}
        type="search"
        inputMode="search"
        autoComplete="off"
        value={query}
        onInput={handleInput}
        onChange={handleInput}
        placeholder="Buscar por nombre o DNI..."
        className="w-full h-14 px-4 rounded-lg text-base border focus:outline-none focus:ring-2 focus:ring-offset-1"
        style={{
          background:   'var(--color-bg-input)',
          color:        'var(--color-text-primary)',
          borderColor:  'var(--color-border)',
          '--tw-ring-color': 'var(--color-border-focus)',
        }}
        aria-label="Buscar visitante por nombre o DNI"
      />

      {/* Inline error */}
      {searchError && (
        <p className="text-sm" style={{ color: 'var(--color-danger-text)' }} aria-live="assertive">
          {searchError}
        </p>
      )}

      {/* No results label */}
      {noResults && !searchError && (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }} aria-live="polite">
          Sin resultados
        </p>
      )}

      {/* Results list */}
      {showList && (
        <div className="overflow-y-auto flex-1">
          <ul role="list" className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {results.map((visitor) => (
              <li key={visitor.visitorId} role="listitem">
                <button
                  onClick={() => handleRowTap(visitor)}
                  className="w-full min-h-14 flex flex-col justify-center px-2 py-2 text-left focus:outline-none focus:ring-2 focus:ring-inset"
                  style={{ '--tw-ring-color': 'var(--color-border-focus)' }}>
                  <span className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    {visitor.visitorName}
                  </span>
                  <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    {visitor.visitorId}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {rawCount > 15 && (
            <p className="text-sm px-2 py-1" style={{ color: 'var(--color-text-secondary)' }}>
              Mostrando los primeros 15 resultados. Sea más específico para filtrar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
