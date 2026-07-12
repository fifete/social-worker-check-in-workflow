import { useEffect, useRef, useState } from 'react';
import { createScannerInstance } from '../services/scannerService';

export default function Zone1Scanner({
  isActive = true,
  onScanSuccess = () => {},
  onScanError = () => {},
}) {
  const videoRef = useRef(null);
  const [cameraDenied, setCameraDenied] = useState(false);

  useEffect(() => {
    let active = true;
    let mediaStream = null;
    let scannerInstance = null;

    if (!isActive) {
      setCameraDenied(false);
      return () => {};
    }

    const startCamera = async () => {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setCameraDenied(true);
        onScanError(new Error('Camera API unavailable'));
        return;
      }

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });

        if (!active || !videoRef.current) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => undefined);
        setCameraDenied(false);

        scannerInstance = await createScannerInstance(
          videoRef.current,
          (decodedValue) => {
            onScanSuccess(decodedValue);
            setCameraDenied(false);
          },
          (error) => {
            const isPermissionIssue =
              error?.name === 'NotAllowedError' ||
              error?.message?.toLowerCase().includes('permission') ||
              error?.message?.toLowerCase().includes('denied');

            if (isPermissionIssue) {
              setCameraDenied(true);
            }

            onScanError(error);
          },
        );
      } catch (error) {
        if (active) {
          setCameraDenied(true);
          onScanError(error);
        }
      }
    };

    startCamera();

    return () => {
      active = false;

      if (scannerInstance?.stop) {
        scannerInstance.stop();
      }

      if (mediaStream?.getTracks) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [isActive, onScanError, onScanSuccess]);

  if (!isActive) {
    return null;
  }

  return (
    <section className="relative flex h-[30%] min-h-[180px] w-full items-center justify-center bg-black">
      <div className="relative aspect-[4/3] w-[72%] min-w-[220px] max-w-[320px] overflow-hidden rounded-sm border-2 border-brand-emerald bg-black p-4 font-sans">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />

        <div className="absolute left-2 top-2 h-6 w-6 border-l-2 border-t-2 border-brand-emerald" />
        <div className="absolute right-2 top-2 h-6 w-6 border-r-2 border-t-2 border-brand-emerald" />
        <div className="absolute bottom-2 left-2 h-6 w-6 border-b-2 border-l-2 border-brand-emerald" />
        <div className="absolute bottom-2 right-2 h-6 w-6 border-b-2 border-r-2 border-brand-emerald" />

        {cameraDenied && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-3 text-center text-sm font-medium text-amber-500">
            ⚠️ Acceso a cámara denegado. Use el buscador de texto.
          </div>
        )}
      </div>
    </section>
  );
}
