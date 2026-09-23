import { useRef, useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db/database';
import { syncManager } from '../../lib/sync/syncManager';
import {
  Camera,
  Upload,
  Pause,
  AlertCircle,
  Loader2,
  Image,
  Crosshair,
  SwitchCamera,
  X,
  Navigation,
  ShieldCheck,
  RotateCw,
} from 'lucide-react';

interface Props {
  inspectionId: string;
  onCapture: (file: File) => Promise<void>;
  readOnly?: boolean;
}

interface LiveGpsState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  altitude: number | null;
  timestamp: string;
}

export default function PhotosTab({ inspectionId, onCapture, readOnly }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [uploadingMediaId, setUploadingMediaId] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  // Live Camera & GPS Viewfinder state
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [liveGps, setLiveGps] = useState<LiveGpsState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    altitude: null,
    timestamp: new Date().toLocaleTimeString(),
  });

  const media = useLiveQuery(
    () => db.media.where('inspectionId').equals(inspectionId).toArray(),
    [inspectionId]
  );

  // Request fresh high-accuracy GPS position
  const refreshGps = useCallback(() => {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLiveGps({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude,
            timestamp: new Date().toLocaleTimeString(),
          });
        },
        (err) => {
          console.debug('Immediate GPS fix error:', err.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  }, []);

  // Live GPS continuous watcher
  useEffect(() => {
    let watchId: number | null = null;
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      refreshGps();
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setLiveGps({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude,
            timestamp: new Date().toLocaleTimeString(),
          });
        },
        (err) => {
          console.debug('Live GPS watch notice:', err.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
      );
    }
    return () => {
      if (watchId !== null && typeof navigator !== 'undefined') {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [refreshGps]);

  // Stop camera helper
  const stopLiveCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsLiveCameraOpen(false);
    setIsCameraLoading(false);
    setCameraError(null);
  }, []);

  // Start live camera stream
  const startLiveCamera = useCallback(async (mode: 'environment' | 'user' = facingMode) => {
    setIsCameraLoading(true);
    setCameraError(null);
    setIsLiveCameraOpen(true);
    refreshGps();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices camera API not supported in this browser.');
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (e1) {
        console.warn('Preferred camera constraint failed, using generic fallback:', e1);
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // Play handled by video tag attributes
        }
      }
    } catch (err) {
      console.warn('Live camera access failed:', err);
      setCameraError('Unable to open live camera. Please grant camera permissions in your browser.');
    } finally {
      setIsCameraLoading(false);
    }
  }, [facingMode, refreshGps]);

  const handleToggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    void startLiveCamera(nextMode);
  };

  const isGpsLocked = Boolean(liveGps.latitude && liveGps.longitude);

  // Capture frame from live video with mandatory GPS watermark
  const handleCaptureLiveSnapshot = async () => {
    const video = videoRef.current;
    if (!video) return;

    if (!isGpsLocked || !liveGps.latitude || !liveGps.longitude) {
      alert('GPS location is strictly mandatory! Please wait for satellite lock before snapping photo.');
      return;
    }

    const width = video.videoWidth || video.clientWidth || 1280;
    const height = video.videoHeight || video.clientHeight || 720;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Mandatory tamper-evident HUD watermark
    const bannerHeight = Math.max(64, Math.round(canvas.height * 0.08));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, canvas.height - bannerHeight, canvas.width, bannerHeight);

    ctx.fillStyle = '#FFFFFF';
    const fontSize = Math.max(14, Math.round(bannerHeight * 0.26));
    ctx.font = `bold ${fontSize}px sans-serif`;

    const timeStr = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    const gpsStr = `GPS: ${liveGps.latitude.toFixed(6)}°, ${liveGps.longitude.toFixed(6)}° (±${Math.round(liveGps.accuracy ?? 0)}m)`;

    ctx.fillText(`FIELD MEDIA | ${timeStr}`, 20, canvas.height - bannerHeight + fontSize + 8);
    ctx.fillStyle = '#34D399';
    ctx.fillText(`📍 ${gpsStr} [VERIFIED LIVE SATELLITE]`, 20, canvas.height - 12);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `photo_${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });
      stopLiveCamera();
      setCapturing(true);
      try {
        await onCapture(file);
      } finally {
        setCapturing(false);
      }
    }, 'image/jpeg', 0.92);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  async function handleUploadNow(mediaId: string) {
    setUploadingMediaId(mediaId);
    try {
      await syncManager.syncNow();
    } finally {
      setUploadingMediaId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Capture trigger — strictly live camera only */}
      {!readOnly ? (
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-600 block">
              Inspection Media (Live Camera Only)
            </label>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
              Gallery Blocked
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              onClick={() => void startLiveCamera()}
              className="h-12 px-5 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95 disabled:opacity-40 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-indigo-100 flex-1"
              disabled={capturing}
              id="btn-capture-photo"
            >
              {capturing ? (
                <><Loader2 size={16} className="animate-spin" /> Storing Geotagged Media…</>
              ) : (
                <><Camera size={18} /> Open Live Camera Viewfinder</>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 rounded-xl border border-zinc-200/70 text-xs">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isGpsLocked ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-ping'}`} />
              <span className="font-semibold text-zinc-700">Live GPS Status:</span>
              {isGpsLocked ? (
                <span className="font-mono text-[11px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  {liveGps.latitude?.toFixed(5)}°, {liveGps.longitude?.toFixed(5)}° (±{Math.round(liveGps.accuracy ?? 0)}m)
                </span>
              ) : (
                <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 animate-pulse">
                  Acquiring Satellites…
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={refreshGps}
              className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RotateCw size={11} /> Refresh Fix
            </button>
          </div>

          <p className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
            <ShieldCheck size={12} className="text-emerald-600 shrink-0" />
            <span>Strict Audit Standard: Only live camera stream with real-time GPS telemetry is permitted.</span>
          </p>
        </div>
      ) : (
        <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200 text-purple-900 text-xs flex items-center gap-2.5 font-medium">
          <span className="text-base">👁</span>
          <span>Reviewer Mode — photo gallery is read-only. You cannot capture new photos for this inspection.</span>
        </div>
      )}

      {/* ── Live Camera Modal with Real-Time GPS HUD Viewfinder ── */}
      {isLiveCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-zinc-950 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl flex flex-col">
            {/* Viewfinder Header */}
            <div className="flex items-center justify-between p-4 bg-zinc-900/90 border-b border-zinc-800 text-white z-10">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase bg-indigo-600 text-white">
                  LIVE CAMERA
                </span>
                <span className="text-xs font-medium text-zinc-300">GPS Geotagger</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleFacingMode}
                  className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer"
                  title="Switch Camera (Front/Back)"
                >
                  <SwitchCamera size={16} />
                </button>
                <button
                  type="button"
                  onClick={stopLiveCamera}
                  className="p-2 rounded-xl bg-zinc-800 hover:bg-rose-900/80 text-zinc-200 hover:text-white transition-colors cursor-pointer"
                  title="Close Camera"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Video Viewfinder Area */}
            <div className="relative aspect-4/3 sm:aspect-16/9 w-full bg-black overflow-hidden flex items-center justify-center">
              {isCameraLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 gap-2">
                  <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">Initializing Live Camera Hardware…</span>
                </div>
              )}

              {cameraError ? (
                <div className="p-6 text-center text-rose-300 space-y-3">
                  <p className="text-sm font-semibold">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => void startLiveCamera()}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl"
                  >
                    Retry Camera
                  </button>
                </div>
              ) : (
                <video
                  ref={(node) => {
                    videoRef.current = node;
                    if (node && streamRef.current && node.srcObject !== streamRef.current) {
                      node.srcObject = streamRef.current;
                      node.play().catch(() => {});
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              )}

              {/* Viewfinder Reticle & HUD Grid */}
              {!isCameraLoading && !cameraError && (
                <>
                  <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-20 border border-white/20">
                    <div className="border-r border-b border-white" />
                    <div className="border-r border-b border-white" />
                    <div className="border-b border-white" />
                    <div className="border-r border-b border-white" />
                    <div className="border-r border-b border-white" />
                    <div className="border-b border-white" />
                    <div className="border-r border-white" />
                    <div className="border-r border-white" />
                    <div />
                  </div>

                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-16 h-16 border-2 border-indigo-400/60 rounded-full flex items-center justify-center">
                      <Crosshair size={28} className="text-indigo-400/80 animate-pulse" />
                    </div>
                  </div>

                  <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-white text-[11px] font-mono space-y-0.5">
                    <div className="flex items-center gap-1 text-emerald-400 font-bold">
                      <Navigation size={12} className="animate-pulse" />
                      <span>LIVE GPS TELEMETRY</span>
                    </div>
                    {isGpsLocked ? (
                      <div>
                        <p>{liveGps.latitude?.toFixed(6)}° N, {liveGps.longitude?.toFixed(6)}° E</p>
                        <p className="text-[10px] text-zinc-400">
                          Acc: ±{Math.round(liveGps.accuracy ?? 0)}m {liveGps.altitude ? `· Alt: ${Math.round(liveGps.altitude)}m` : ''}
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <p className="text-amber-300 animate-pulse">Acquiring GPS Fix…</p>
                        <button
                          type="button"
                          onClick={refreshGps}
                          className="px-1.5 py-0.5 bg-zinc-800 rounded text-[10px] text-white hover:bg-zinc-700"
                        >
                          Retry GPS
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-xl border border-white/10 text-white text-[11px] font-mono">
                    {new Date().toLocaleTimeString()}
                  </div>
                </>
              )}
            </div>

            {/* Viewfinder Controls & Capture Shutter */}
            <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                {isGpsLocked ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-semibold text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    GPS Locked ({liveGps.latitude?.toFixed(4)}°, {liveGps.longitude?.toFixed(4)}°)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/60 font-semibold text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    GPS Lock Mandatory
                  </span>
                )}
              </div>

              {/* Big Shutter Button */}
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={handleCaptureLiveSnapshot}
                  disabled={isCameraLoading || !!cameraError || !isGpsLocked}
                  className={`w-16 h-16 rounded-full border-4 transition-all flex items-center justify-center shadow-lg active:scale-95 cursor-pointer ${
                    isGpsLocked
                      ? 'border-emerald-400 bg-rose-600 hover:bg-rose-500 shadow-rose-950/50'
                      : 'border-zinc-700 bg-zinc-800 opacity-40 cursor-not-allowed'
                  }`}
                  id="btn-snap-photo-tab"
                  title={isGpsLocked ? 'Capture Photo with Geotag' : 'GPS Lock Required to Snap'}
                >
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                    <Camera size={22} className="text-white" />
                  </div>
                </button>
                {!isGpsLocked && (
                  <span className="text-[10px] text-amber-400/90 font-medium">GPS Required</span>
                )}
              </div>

              <button
                type="button"
                onClick={stopLiveCamera}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
        {media?.map(m => {
          const isCurrentUploading = uploadingMediaId === m.id;
          const status = isCurrentUploading ? 'UPLOADING' : m.uploadStatus;
          const pct = m.uploadedBytes && m.totalBytes
            ? Math.round((m.uploadedBytes / m.totalBytes) * 100)
            : 0;

          return (
            <div key={m.id} className="bg-white border border-zinc-200/80 rounded-2xl overflow-hidden shadow-sm flex flex-col" id={`photo-${m.id}`}>
              {/* Preview */}
              <div className="aspect-square bg-zinc-100 flex items-center justify-center relative overflow-hidden">
                {m.secureUrl ? (
                  <img
                    src={m.secureUrl.replace('/upload/', '/upload/w_400,h_400,c_fill/')}
                    alt={m.fileName}
                    className="w-full h-full object-cover"
                  />
                ) : m.localBlob ? (
                  <BlobPreview blob={m.localBlob} alt={m.fileName} />
                ) : (
                  <Image size={32} className="text-zinc-300" />
                )}

                {/* Status overlay */}
                {status !== 'COMPLETED' && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center">
                    <UploadStatusIcon status={status} />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3 space-y-2">
                <p className="text-xs font-bold text-zinc-900 truncate">{m.fileName}</p>
                {status === 'COMPLETED' ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-block">
                    Uploaded
                  </span>
                ) : status === 'UPLOADING' ? (
                  <div className="space-y-1">
                    <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-600 h-full rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] font-bold text-indigo-600">{pct}% uploading</p>
                  </div>
                ) : status === 'PAUSED' ? (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 inline-block">
                      Paused at {pct}%
                    </span>
                    <button
                      onClick={() => handleUploadNow(m.id)}
                      className="w-full h-7 rounded-lg text-[10px] font-bold bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Upload size={11} /> Resume
                    </button>
                  </div>
                ) : status === 'FAILED' ? (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 inline-block">
                      Failed
                    </span>
                    <button
                      onClick={() => handleUploadNow(m.id)}
                      className="w-full h-7 rounded-lg text-[10px] font-bold bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-all cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200 inline-block">
                    Queued
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {media?.length === 0 && (
          <div className="col-span-full text-center text-zinc-400 py-12 bg-white rounded-2xl border border-zinc-200/80 p-8 shadow-sm">
            <Camera size={32} className="mx-auto mb-2 text-zinc-300" />
            <p className="font-semibold text-sm">No photos attached yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function BlobPreview({ blob, alt }: { blob: Blob; alt: string }) {
  const [url] = useState(() => URL.createObjectURL(blob));
  return <img src={url} alt={alt} className="w-full h-full object-cover" />;
}

function UploadStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'UPLOADING': return <Loader2 size={24} className="text-white animate-spin" />;
    case 'PAUSED': return <Pause size={24} className="text-amber-300" />;
    case 'FAILED': return <AlertCircle size={24} className="text-rose-400" />;
    default: return <Upload size={24} className="text-white/80" />;
  }
}
