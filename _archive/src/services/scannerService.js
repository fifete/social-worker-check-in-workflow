const NATIVE_BARCODE_FORMATS = ['code_39', 'code_128', 'pdf417'];

export function normalizeBarcodeString(rawValue) {
  if (typeof rawValue !== 'string') {
    return '';
  }

  const trimmedValue = rawValue.replace(/[\u0000-\u001F\u007F]/g, '').trim();

  if (!trimmedValue) {
    return '';
  }

  const dniMatch = trimmedValue.match(/\d{8}/);
  if (dniMatch) {
    return dniMatch[0];
  }

  return trimmedValue.replace(/[^A-Z0-9]/g, '').toUpperCase();
}

function createNativeScanner(videoElement, onDecode, onError) {
  if (typeof window === 'undefined' || typeof window.BarcodeDetector === 'undefined') {
    return null;
  }

  const detector = new window.BarcodeDetector({ formats: NATIVE_BARCODE_FORMATS });
  let animationFrameId = null;
  let isStopped = false;

  const scanFrame = async () => {
    if (isStopped || !videoElement) {
      return;
    }

    try {
      const detectedBarcodes = await detector.detect(videoElement);
      if (!isStopped && detectedBarcodes?.length) {
        const normalizedId = normalizeBarcodeString(detectedBarcodes[0]?.rawValue ?? '');

        if (normalizedId) {
          onDecode(normalizedId);
        } else {
          onError?.(new Error('No se pudo normalizar el código escaneado.'));
        }
      }
    } catch (error) {
      if (!isStopped) {
        onError?.(error);
      }
    } finally {
      if (!isStopped) {
        animationFrameId = window.requestAnimationFrame(scanFrame);
      }
    }
  };

  animationFrameId = window.requestAnimationFrame(scanFrame);

  return {
    stop() {
      isStopped = true;

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    },
  };
}

async function createFallbackScanner(videoElement, onDecode, onError) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const zxingModule = await import('@zxing/library');
    const reader = new zxingModule.BrowserMultiFormatReader();

    let isStopped = false;
    const hints = new Map();
    hints.set(zxingModule.DecodeHintType.POSSIBLE_FORMATS, [
      zxingModule.BarcodeFormat.CODE_39,
      zxingModule.BarcodeFormat.CODE_128,
      zxingModule.BarcodeFormat.PDF_417,
    ]);

    const handleResult = (result, error) => {
      if (isStopped) {
        return;
      }

      if (result) {
        const normalizedId = normalizeBarcodeString(result?.getText?.() ?? '');

        if (normalizedId) {
          onDecode(normalizedId);
        } else {
          onError?.(new Error('No se pudo normalizar el código escaneado.'));
        }

        return;
      }

      if (error) {
        onError?.(error);
      }
    };

    await reader.decodeFromVideoDevice(undefined, videoElement, handleResult, hints);

    return {
      stop() {
        isStopped = true;

        try {
          reader.reset();
        } catch (resetError) {
          onError?.(resetError);
        }
      },
    };
  } catch (error) {
    onError?.(error);
    return null;
  }
}

export async function createScannerInstance(videoElement, onDecode, onError) {
  if (!videoElement) {
    return null;
  }

  const nativeScanner = createNativeScanner(videoElement, onDecode, onError);
  if (nativeScanner) {
    return nativeScanner;
  }

  return createFallbackScanner(videoElement, onDecode, onError);
}
