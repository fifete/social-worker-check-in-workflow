import { useEffect, useRef } from 'react';

// Display 3000ms · fade-in 200ms · fade-out 300ms (spec: ui-behavior/global.md)
const DISPLAY_MS  = 3000;
const FADE_IN_MS  = 200;
const FADE_OUT_MS = 300;

export default function Toast({ visible, message, onDismiss }) {
  const timerRef   = useRef(null);
  const fadeRef    = useRef(null);

  useEffect(() => {
    if (!visible) return;

    clearTimeout(timerRef.current);
    clearTimeout(fadeRef.current);

    // Start fade-out after DISPLAY_MS, then call onDismiss after fade completes
    timerRef.current = setTimeout(() => {
      fadeRef.current = setTimeout(onDismiss, FADE_OUT_MS);
    }, DISPLAY_MS);

    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(fadeRef.current);
    };
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: '90vw',
        background:   'var(--color-success)',
        color:        'var(--color-text-inverse)',
        borderRadius: 8,
        padding:      '12px 20px',
        fontSize:     16,
        fontWeight:   600,
        zIndex:       55,
        animation: `toastIn ${FADE_IN_MS}ms ease-out`,
        whiteSpace: 'nowrap',
      }}>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
      {message}
    </div>
  );
}
