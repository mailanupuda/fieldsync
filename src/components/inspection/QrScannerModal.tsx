import { useState, useRef, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';
import { Camera, X, CheckCircle2, AlertTriangle, RefreshCw, Upload, Zap, ShieldAlert } from 'lucide-react';
import type { Asset } from '@/types/db';
import { permissionManager } from '@/lib/permissions/permissionManager';
import { useAndroidBackHandler } from '@/hooks/useAndroidBackHandler';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  expectedAsset: Asset;
  onVerified: (scannedCode: string) => Promise<void>;
}

export default function QrScannerModal({
  isOpen,
  onClose,
  expectedAsset,
  onVerified,
}: QrScannerModalProps) {
  useAndroidBackHandler(isOpen, onClose);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [scanResult, setScanResult] = useState<{
    code: string;
    isMatch: boolean;
  } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    setCameraActive(false);
  }, [stream]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraDenied(false);
    setScanResult(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera is not supported on this device or browser.');
        setCameraActive(false);
        return;
      }

      // Check permission state before requesting
      const permState = await permissionManager.query('camera');
      if (permState === 'denied') {
        setCameraDenied(true);
        setCameraActive(false);
        return;
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      setStream(mediaStream);
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setCameraDenied(true);
        setCameraError(null);
      } else if (e.name === 'NotFoundError') {
        setCameraError('No camera hardware detected on this device.');
      } else {
        setCameraError(e.message ?? 'Unable to access camera');
      }
      setCameraActive(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void startCamera();
    } else {
      stopCamera();
      setScanResult(null);
      setCameraError(null);
      setShowManualInput(false);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  const handleScannedData = useCallback((scanned: string) => {
    // Clean string (some barcodes add prefix/suffix or URLs)
    let cleaned = scanned.trim();
    if (cleaned.includes('/')) {
      const parts = cleaned.split('/');
      cleaned = parts[parts.length - 1];
    }
    const isMatch = cleaned.toUpperCase() === expectedAsset.assetCode.toUpperCase();
    setScanResult({ code: cleaned, isMatch });
    stopCamera();
  }, [expectedAsset.assetCode, stopCamera]);

  // Frame processing loop for QR decoding
  useEffect(() => {
    let animId: number;
    let isActive = true;

    const scanFrame = () => {
      if (!isActive || !videoRef.current || !canvasRef.current || !cameraActive || scanResult) {
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data.trim()) {
          const raw = code.data.trim();
          handleScannedData(raw);
          return;
        }
      }

      animId = requestAnimationFrame(scanFrame);
    };

    if (cameraActive && !scanResult) {
      animId = requestAnimationFrame(scanFrame);
    }

    return () => {
      isActive = false;
      cancelAnimationFrame(animId);
    };
  }, [cameraActive, scanResult, handleScannedData]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data.trim()) {
          handleScannedData(code.data.trim());
        } else {
          setCameraError('No QR code detected in the selected image. Please try another photo or enter manually.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const confirmVerification = async () => {
    if (!scanResult || !scanResult.isMatch) return;
    setIsVerifying(true);
    try {
      await onVerified(scanResult.code);
      onClose();
    } finally {
      setIsVerifying(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleScannedData(manualCode.trim());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-900/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-zinc-200 flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shadow-indigo-200">
              <Camera size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900">QR Asset Identification</h3>
              <p className="text-[11px] text-zinc-500">Scan physical tag on equipment</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-zinc-200 hover:bg-zinc-100 flex items-center justify-center text-zinc-500 cursor-pointer transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Expected Asset Card */}
        <div className="mx-4 mt-4 p-3 rounded-2xl bg-indigo-50/80 border border-indigo-100 text-xs text-indigo-950 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">Target Asset</span>
            <span className="font-bold text-zinc-900">{expectedAsset.name}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-zinc-500 block">Expected Code</span>
            <span className="font-mono font-bold text-indigo-700 bg-white px-2 py-0.5 rounded-lg border border-indigo-200">
              {expectedAsset.assetCode}
            </span>
          </div>
        </div>

        {/* Viewfinder / Results Body */}
        <div className="p-4 flex-1 flex flex-col items-center">
          {scanResult ? (
            <div className="w-full py-6 flex flex-col items-center text-center space-y-4">
              <div
                className={`w-16 h-16 rounded-3xl flex items-center justify-center ${
                  scanResult.isMatch
                    ? 'bg-emerald-100 text-emerald-600 shadow-lg shadow-emerald-100'
                    : 'bg-rose-100 text-rose-600 shadow-lg shadow-rose-100'
                }`}
              >
                {scanResult.isMatch ? <CheckCircle2 size={36} /> : <AlertTriangle size={36} />}
              </div>

              <div>
                <h4 className="text-base font-bold text-zinc-900">
                  {scanResult.isMatch ? 'Asset Successfully Verified!' : 'Asset Code Mismatch!'}
                </h4>
                <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                  {scanResult.isMatch
                    ? `Physical tag matches system record for ${expectedAsset.name}. Field checklist is now unlocked.`
                    : `Scanned code does not match ${expectedAsset.assetCode}. Verify you are at the correct machine.`}
                </p>
              </div>

              <div className="w-full p-3 bg-zinc-50 rounded-2xl border border-zinc-200 font-mono text-xs text-zinc-800 space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Scanned:</span>
                  <span className="font-bold">{scanResult.code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Expected:</span>
                  <span className="font-bold text-indigo-600">{expectedAsset.assetCode}</span>
                </div>
              </div>

              <div className="flex gap-2 w-full pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setScanResult(null);
                    void startCamera();
                  }}
                  className="flex-1 h-11 rounded-2xl border border-zinc-200 font-bold text-xs text-zinc-700 hover:bg-zinc-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={14} /> Rescan
                </button>
                {scanResult.isMatch && (
                  <button
                    type="button"
                    onClick={confirmVerification}
                    disabled={isVerifying}
                    className="flex-1 h-11 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-200 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 size={14} /> {isVerifying ? 'Confirming…' : 'Unlock Checklist'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center">
              {/* Camera Scanner Viewport */}
              <div className="relative w-full aspect-square max-w-[280px] bg-black rounded-3xl overflow-hidden shadow-inner flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${cameraActive ? 'opacity-100' : 'opacity-0'}`}
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Target overlay reticle */}
                {cameraActive && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-48 h-48 border-2 border-indigo-400/80 rounded-2xl relative shadow-lg">
                      {/* Corner markers */}
                      <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-white rounded-tl-sm" />
                      <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-white rounded-tr-sm" />
                      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-white rounded-bl-sm" />
                      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-white rounded-br-sm" />
                      {/* Laser scan animation */}
                      <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent absolute top-1/2 -translate-y-1/2 animate-pulse" />
                    </div>
                  </div>
                )}

                {/* Camera Denied — Android Settings guidance */}
                {cameraDenied && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-rose-950/95">
                    <ShieldAlert size={28} className="text-rose-400 mb-2" />
                    <p className="text-rose-200 font-bold text-xs">Camera Access Denied</p>
                    <p className="text-rose-300/80 text-[10px] mt-1">
                      Android Settings → Apps → FieldSync → Permissions → Camera → Allow
                    </p>
                    <button
                      type="button"
                      onClick={() => { setCameraDenied(false); void startCamera(); }}
                      className="mt-3 px-3 py-1.5 rounded-xl bg-rose-700 text-white text-[10px] font-semibold"
                    >
                      <RefreshCw size={11} className="inline mr-1" /> Re-check
                    </button>
                  </div>
                )}

                {/* Loading / Error placeholder */}
                {!cameraActive && !cameraDenied && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-zinc-400 text-xs">
                    <Camera size={32} className="text-zinc-500 mb-2 animate-bounce" />
                    <p>{cameraError || 'Initializing camera stream…'}</p>
                    {cameraError && (
                      <button
                        type="button"
                        onClick={startCamera}
                        className="mt-3 px-3 py-1.5 rounded-xl bg-zinc-800 text-white text-xs font-semibold"
                      >
                        Try Again
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Direct Simulation / Photo fallback */}
              <div className="w-full mt-3 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => handleScannedData(expectedAsset.assetCode)}
                  className="px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold hover:bg-indigo-100 flex items-center gap-1.5 transition-colors cursor-pointer text-[11px]"
                >
                  <Zap size={13} /> Verify Code ({expectedAsset.assetCode})
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl border border-zinc-200 text-zinc-700 font-bold hover:bg-zinc-50 flex items-center gap-1.5 transition-colors cursor-pointer text-[11px]"
                >
                  <Upload size={13} /> Photo
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {/* Manual Input Toggle */}
              <div className="w-full mt-3 border-t border-zinc-100 pt-3">
                {!showManualInput ? (
                  <button
                    type="button"
                    onClick={() => setShowManualInput(true)}
                    className="w-full text-center text-[11px] font-semibold text-zinc-500 hover:text-indigo-600 transition-colors"
                  >
                    Tag unreadable or damaged? Enter code manually →
                  </button>
                ) : (
                  <form onSubmit={handleManualSubmit} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. NET-AP204"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      className="flex-1 h-9 px-3 rounded-xl border border-zinc-200 text-xs font-mono uppercase focus:outline-hidden focus:border-indigo-500"
                    />
                    <button
                      type="submit"
                      className="h-9 px-4 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-black transition-colors"
                    >
                      Verify
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
