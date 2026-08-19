import { useEffect, useRef, useCallback } from 'react';
import * as visitorService from '../services/visitorService.js';

// Audio: sine chirp for scan success and error tone
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, duration, gain = 0.4) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration - 0.03);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // audio unavailable — non-blocking
  }
}

// Corner bracket overlay: four L-shaped brackets at corners of scan area
function ScanFrame({ color }) {
  const arm = 24;
  const stroke = 3;
  const style = { position: 'absolute', width: arm, height: arm, boxSizing: 'border-box' };
  const borderStyle = `${stroke}px solid ${color}`;
  return (
    <>
      {/* Top-left */}
      <div style={{ ...style, top: 0, left: 0, borderTop: borderStyle, borderLeft: borderStyle }} />
      {/* Top-right */}
      <div style={{ ...style, top: 0, right: 0, borderTop: borderStyle, borderRight: borderStyle }} />
      {/* Bottom-left */}
      <div style={{ ...style, bottom: 0, left: 0, borderBottom: borderStyle, borderLeft: borderStyle }} />
      {/* Bottom-right */}
      <div style={{ ...style, bottom: 0, right: 0, borderBottom: borderStyle, borderRight: borderStyle }} />
    </>
  );
}

// SVG circular progress arc for CANDIDATE_DETECTED hold window (800ms)
function ProgressArc({ color }) {
  const r = 28;
  const circumference = 2 * Math.PI * r;
  return (
    <svg width="72" height="72" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
      <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
      <circle
        cx="36" cy="36" r={r}
        fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={circumference}
        strokeLinecap="round"
        transform="rotate(-90 36 36)"
        style={{ animation: 'scanArc 800ms linear forwards' }}
      />
      <style>{`@keyframes scanArc { to { stroke-dashoffset: 0; } }`}</style>
    </svg>
  );
}

export default function Zone1Scanner({ scannerState, scanCandidate, send, onBarcodeNotFound }) {
  const videoRef    = useRef(null);
  const streamRef   = useRef(null);
  const rafRef      = useRef(null);
  const zxingRef    = useRef(null);
  const prevScannerState = useRef(null);

  // ── Camera start / stop ─────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (zxingRef.current) {
      try { zxingRef.current.reset(); } catch {}
      zxingRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        send({ type: 'CAMERA_PERMISSION_DENIED' });
      }
    }
  }, [send]);

  // ── Native BarcodeDetector scanning loop ────────────────────────────────
  const startNativeScan = useCallback(() => {
    const detector = new BarcodeDetector({
      formats: ['pdf417', 'code_128', 'ean_13', 'ean_8', 'qr_code'],
    });
    let lastValue = null;

    const loop = async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      try {
        const results = await detector.detect(videoRef.current);
        if (results.length > 0) {
          const value = results[0].rawValue;
          if (lastValue !== value) {
            lastValue = value;
            send({ type: 'CANDIDATE_DETECTED', value });
          }
          // keep sending to refresh the hold window on ambiguous change
        } else {
          if (lastValue !== null) {
            lastValue = null;
            send({ type: 'CANDIDATE_LOST' });
          }
        }
      } catch {
        // detection error — non-blocking
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [send]);

  // ── @zxing fallback scanning ─────────────────────────────────────────────
  const startZxingScan = useCallback(async () => {
    const { BrowserMultiFormatReader } = await import('@zxing/library'); // impl detail from _archive
    const reader = new BrowserMultiFormatReader();
    zxingRef.current = reader;
    try {
      reader.decodeFromVideoElement(videoRef.current, (result, err) => {
        if (result) {
          const value = result.getText();
          send({ type: 'CANDIDATE_DETECTED', value });
        } else if (err && err.name !== 'NotFoundException') {
          send({ type: 'CANDIDATE_LOST' });
        }
      });
    } catch {
      send({ type: 'CAMERA_PERMISSION_DENIED' });
    }
  }, [send]);

  // ── Initialization ──────────────────────────────────────────────────────
  useEffect(() => {
    if (scannerState === 'IDLE' || scannerState === 'FALLBACK_ACTIVE') {
      if (!streamRef.current) {
        startCamera().then(() => {
          if (scannerState === 'FALLBACK_ACTIVE') {
            startZxingScan();
          } else if ('BarcodeDetector' in window) {
            startNativeScan();
          } else {
            send({ type: 'BARCODE_DETECTOR_UNAVAILABLE' });
          }
        });
      }
    }

    if (scannerState === 'CAMERA_DENIED') {
      stopCamera();
    }
  }, []); // start once on mount; state transitions handle the rest below

  // ── React to scanner state transitions ────────────────────────────────────
  useEffect(() => {
    const prev = prevScannerState.current;
    prevScannerState.current = scannerState;

    // Re-initialize camera when returning to IDLE from error/denied
    if (scannerState === 'IDLE' && (prev === 'CAMERA_DENIED' || prev === null)) {
      stopCamera();
      startCamera().then(() => {
        if ('BarcodeDetector' in window) {
          startNativeScan();
        } else {
          send({ type: 'BARCODE_DETECTOR_UNAVAILABLE' });
        }
      });
    }

    if (scannerState === 'FALLBACK_ACTIVE' && !streamRef.current) {
      startCamera().then(() => startZxingScan());
    }

    // SCAN_SUCCESS: look up visitor and dispatch BARCODE_RESULT or pre-fill Zone 2
    if (scannerState === 'SCAN_SUCCESS' && prev !== 'SCAN_SUCCESS') {
      playTone(880, 0.15);
      if (scanCandidate) {
        visitorService.getVisitorById(scanCandidate).then(visitor => {
          if (visitor) {
            send({ type: 'BARCODE_RESULT', visitor });
          } else {
            onBarcodeNotFound(scanCandidate);
          }
        }).catch(() => {
          onBarcodeNotFound(scanCandidate);
        });
      }
    }

    // SCAN_ERROR: play error tone
    if (scannerState === 'SCAN_ERROR' && prev !== 'SCAN_ERROR') {
      playTone(220, 0.2);
    }
  }, [scannerState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // ── Derived visual state ─────────────────────────────────────────────────
  const frameColor =
    scannerState === 'CANDIDATE_DETECTED'
      ? 'var(--color-scanner-candidate)'
      : scannerState === 'SCAN_SUCCESS'
      ? 'var(--color-scanner-success)'
      : scannerState === 'SCAN_ERROR'
      ? 'var(--color-scanner-error)'
      : 'var(--color-scanner-idle)';

  const flashOverlay =
    scannerState === 'SCAN_SUCCESS'
      ? { background: 'var(--color-scanner-success)', opacity: 0.5 }
      : scannerState === 'SCAN_ERROR'
      ? { background: 'var(--color-scanner-error)', opacity: 0.4 }
      : null;

  const label =
    scannerState === 'CANDIDATE_DETECTED' ? 'Mantenga el código en el encuadre...'
    : scannerState === 'SCAN_SUCCESS'     ? '¡Código leído!'
    : scannerState === 'SCAN_ERROR'       ? 'No se pudo leer. Inténtelo de nuevo.'
    : 'Apunte al código de barras';

  if (scannerState === 'CAMERA_DENIED') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4"
        style={{ background: 'var(--color-bg-card)' }}
        aria-live="assertive">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M2 2L22 22M10.58 10.58A3 3 0 0013.42 13.42M6.35 6.35A7 7 0 0117.65 17.65" stroke="var(--color-text-disabled)" strokeWidth="2" strokeLinecap="round" />
          <path d="M9 9v.01M15 9v.01M3 9h1m-1 6h1M21 9h-1m1 6h-1M12 3a9 9 0 000 18" stroke="var(--color-text-disabled)" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p className="text-xl font-bold text-center" style={{ color: 'var(--color-text-primary)' }}>
          Cámara no disponible
        </p>
        <p className="text-sm text-center" style={{ color: 'var(--color-text-secondary)' }}>
          Permiso de cámara denegado. Active el permiso en la configuración de su navegador.
        </p>
        <button
          onClick={() => send({ type: 'RETRY_CAMERA' })}
          className="w-full h-14 rounded-lg text-base font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{ background: 'var(--color-primary)', color: 'var(--color-text-inverse)' }}>
          Reintentar
        </button>
      </div>
    );
  }

  // Width of the scan area is 80% of zone width; centered
  const scanAreaStyle = {
    position: 'absolute',
    top: '50%', left: '10%',
    width: '80%', height: '60%',
    transform: 'translateY(-50%)',
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#000' }}>
      {/* Camera feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        aria-hidden="true"
      />

      {/* Flash overlay */}
      {flashOverlay && (
        <div style={{
          position: 'absolute', inset: 0,
          ...flashOverlay,
          animation: 'zone1flash 300ms ease-out forwards',
          pointerEvents: 'none',
        }}>
          <style>{`@keyframes zone1flash { 0% { opacity: ${flashOverlay.opacity}; } 100% { opacity: 0; } }`}</style>
        </div>
      )}

      {/* Scan frame area */}
      <div style={{ ...scanAreaStyle, position: 'absolute' }} aria-live="polite" aria-label={label}>
        <ScanFrame color={frameColor} />
        {scannerState === 'CANDIDATE_DETECTED' && (
          <ProgressArc color="var(--color-scanner-candidate)" />
        )}
      </div>

      {/* Status label */}
      <div style={{
        position: 'absolute', bottom: '12px', left: 0, right: 0,
        textAlign: 'center', padding: '0 12px',
      }}>
        <span className="text-sm font-semibold px-2 py-1 rounded"
          style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}>
          {label}
        </span>
      </div>

      {/* Fallback badge */}
      {scannerState === 'FALLBACK_ACTIVE' && (
        <div style={{
          position: 'absolute', bottom: 8, right: 8,
          background: 'rgba(0,0,0,0.65)', borderRadius: 4,
          padding: '2px 6px',
        }}>
          <span className="text-xs" style={{ color: 'var(--color-text-disabled)' }}>
            Modo compatibilidad
          </span>
        </div>
      )}
    </div>
  );
}
