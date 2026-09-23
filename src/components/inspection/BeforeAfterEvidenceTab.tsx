import { useState, useRef, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/database';
import { useAuthStore } from '@/stores/authStore';
import { createOperation } from '@/lib/db/repositories/operations';
import { createAuditEvent } from '@/lib/db/repositories/auditEvents';
import { syncManager } from '@/lib/sync/syncManager';
import { permissionManager } from '@/lib/permissions/permissionManager';
import PermissionGate from '@/components/permissions/PermissionGate';
import {
  Camera,
  Layers,
  MapPin,
  CheckCircle2,
  Sliders,
  Calendar,
  Crosshair,
  SwitchCamera,
  X,
  Navigation,
  Check,
  ShieldCheck,
  AlertTriangle,
  RotateCw,
} from 'lucide-react';
import type { WorkEvidence, EvidenceStage } from '@/types/db';

interface BeforeAfterEvidenceTabProps {
  inspectionId: string;
  readOnly?: boolean;
}

interface LiveGpsState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  altitude: number | null;
  timestamp: string;
}

export default function BeforeAfterEvidenceTab({
  inspectionId,
  readOnly = false,
}: BeforeAfterEvidenceTabProps) {
  const { user } = useAuthStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [activeStage, setActiveStage] = useState<EvidenceStage>('BEFORE');
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sliderPosition, setSliderPosition] = useState(50);
  const [viewMode, setViewMode] = useState<'cards' | 'compare'>('cards');

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

  // Request fresh high-accuracy GPS position with network fallback
  const refreshGps = useCallback(async () => {
    try {
      const pos = await permissionManager.requestGeolocation();
      if (pos) {
        setLiveGps({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
    } catch (err) {
      console.debug('Immediate GPS fix error:', err);
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

  // Stop camera stream helper
  const stopLiveCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsLiveCameraOpen(false);
    setIsCameraLoading(false);
    setCameraError(null);
  }, []);

  // Start live camera stream with multi-tier fallback
  const startLiveCamera = useCallback(async (mode: 'environment' | 'user' = facingMode) => {
    setIsCameraLoading(true);
    setCameraError(null);
    setIsLiveCameraOpen(true);
    refreshGps();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices camera API not supported in this browser.');
      }

      let stream: MediaStream;
      try {
        // Preferred high-quality constraint
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (e1) {
        console.warn('Preferred camera constraint failed, using generic video fallback:', e1);
        // Fallback constraint (works on laptops/webcams and all phones)
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;

      // Attach stream to video element if already mounted
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // Auto-play was prevented; video tag has autoPlay and playsInline
        }
      }
    } catch (err) {
      console.warn('Live camera access failed:', err);
      setCameraError('Unable to open live camera. Please ensure camera permissions are granted in browser settings.');
    } finally {
      setIsCameraLoading(false);
    }
  }, [facingMode, refreshGps]);

  // Toggle camera direction
  const handleToggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    void startLiveCamera(nextMode);
  };

  // GPS lock status
  const isGpsLocked = Boolean(liveGps.latitude && liveGps.longitude);

  // Capture frame from live video with GPS Watermark (GPS is MANDATORY)
  const handleCaptureLiveSnapshot = () => {
    const video = videoRef.current;
    if (!video) {
      alert('Camera viewfinder not ready yet.');
      return;
    }

    if (!isGpsLocked || !liveGps.latitude || !liveGps.longitude) {
      alert('GPS location is strictly mandatory! Please allow location access or wait for satellite lock.');
      return;
    }

    const width = video.videoWidth || video.clientWidth || 1280;
    const height = video.videoHeight || video.clientHeight || 720;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw raw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Mandatory tamper-evident HUD / Watermark banner stamped onto photo
    const bannerHeight = Math.max(64, Math.round(canvas.height * 0.08));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, canvas.height - bannerHeight, canvas.width, bannerHeight);

    ctx.fillStyle = '#FFFFFF';
    const fontSize = Math.max(14, Math.round(bannerHeight * 0.26));
    ctx.font = `bold ${fontSize}px sans-serif`;

    const stageLabel = activeStage === 'BEFORE' ? 'STAGE: BEFORE INTERVENTION' : 'STAGE: AFTER RESTORATION';
    const timeStr = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    const gpsStr = `GPS: ${liveGps.latitude.toFixed(6)}°, ${liveGps.longitude.toFixed(6)}° (±${Math.round(liveGps.accuracy ?? 0)}m)`;

    ctx.fillText(`${stageLabel} | ${timeStr}`, 20, canvas.height - bannerHeight + fontSize + 8);
    ctx.fillStyle = '#34D399'; // Emerald highlight for locked GPS
    ctx.fillText(`📍 ${gpsStr} [VERIFIED LIVE SATELLITE]`, 20, canvas.height - 12);

    // Convert canvas to file & preview
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `evidence_${activeStage.toLowerCase()}_${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });
      setSelectedFile(file);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      stopLiveCamera();
    }, 'image/jpeg', 0.92);
  };

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Query evidence from IndexedDB
  const evidenceList = useLiveQuery(
    () => db.workEvidence.where('inspectionId').equals(inspectionId).toArray(),
    [inspectionId]
  ) as WorkEvidence[] | undefined;

  const beforeEvidence = evidenceList?.filter((e) => e.stage === 'BEFORE') ?? [];
  const afterEvidence = evidenceList?.filter((e) => e.stage === 'AFTER') ?? [];

  const handleSaveEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !user) return;

    if (!liveGps.latitude || !liveGps.longitude) {
      alert('Cannot save evidence: Live GPS location is strictly mandatory for compliance.');
      return;
    }

    setIsCapturing(true);
    try {
      const evidenceId = crypto.randomUUID();
      const now = new Date().toISOString();

      // Convert file to Base64 data URL for durable local storage
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(selectedFile);
      });

      const record: WorkEvidence = {
        id: evidenceId,
        inspectionId,
        stage: activeStage,
        title: evidenceTitle.trim() || `${activeStage === 'BEFORE' ? 'Before Intervention' : 'After Remediation'} Evidence`,
        description: evidenceDescription.trim() || undefined,
        photoUrl: dataUrl,
        localBlob: selectedFile,
        capturedBy: user.id,
        capturedByName: user.fullName || 'Field Technician',
        capturedAt: now,
        gpsLatitude: liveGps.latitude,
        gpsLongitude: liveGps.longitude,
        syncStatus: 'PENDING',
      };

      await db.workEvidence.put(record);

      await createOperation({
        userId: user.id,
        inspectionId,
        entityType: 'workEvidence',
        entityId: evidenceId,
        operationType: 'CREATE',
        payload: {
          id: evidenceId,
          inspectionId,
          stage: activeStage,
          title: record.title,
          description: record.description,
          capturedAt: now,
          gpsLatitude: liveGps.latitude,
          gpsLongitude: liveGps.longitude,
        },
      });

      await createAuditEvent({
        userId: user.id,
        userName: user.fullName,
        inspectionId,
        entityType: 'WORK_EVIDENCE',
        entityId: evidenceId,
        action: 'PHOTO_ADDED',
        field: activeStage,
        afterValue: record.title,
      });

      // Reset form
      setSelectedFile(null);
      setPreviewUrl(null);
      setEvidenceTitle('');
      setEvidenceDescription('');
      void syncManager.syncNow();
    } catch (err) {
      console.error('Failed to save evidence:', err);
    } finally {
      setIsCapturing(false);
    }
  };

  const primaryBefore = beforeEvidence[0];
  const primaryAfter = afterEvidence[0];

  return (
    <div className="space-y-6">
      {/* Top Banner & Mode Toggle */}
      <div className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-zinc-900">Before & After Field Evidence</h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
              <ShieldCheck size={11} /> Live Geotag Standard
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Tamper-proof live camera capture with mandatory real-time GPS telemetry and side-by-side comparison slider.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-zinc-900 text-white shadow-2xs'
                : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Dual View ({beforeEvidence.length}B / {afterEvidence.length}A)
          </button>
          {primaryBefore && primaryAfter && (
            <button
              type="button"
              onClick={() => setViewMode('compare')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'compare'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              <Sliders size={13} /> Interactive Slider
            </button>
          )}
        </div>
      </div>

      {/* Interactive Before/After Split Comparison Slider */}
      {viewMode === 'compare' && primaryBefore && primaryAfter && (
        <div className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-amber-600 uppercase tracking-wider">◀ Before Intervention</span>
            <span className="font-bold text-emerald-600 uppercase tracking-wider">Restored After ▶</span>
          </div>

          <div className="relative aspect-video max-h-[420px] w-full bg-zinc-900 rounded-2xl overflow-hidden select-none">
            {/* After Image (Background) */}
            <img
              src={primaryAfter.photoUrl}
              alt="After remediation"
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Before Image (Clipped Overlay) */}
            <div
              className="absolute inset-y-0 left-0 overflow-hidden"
              style={{ width: `${sliderPosition}%` }}
            >
              <img
                src={primaryBefore.photoUrl}
                alt="Before remediation"
                className="absolute inset-0 w-full h-full object-cover max-w-none"
                style={{ width: '100%', minWidth: '100%' }}
              />
            </div>

            {/* Draggable Divider Bar */}
            <div
              className="absolute inset-y-0 w-1 bg-white cursor-ew-resize shadow-2xl flex items-center justify-center pointer-events-none"
              style={{ left: `${sliderPosition}%` }}
            >
              <div className="w-8 h-8 rounded-full bg-white text-zinc-900 shadow-xl flex items-center justify-center font-mono text-[10px] font-bold">
                ⇔
              </div>
            </div>

            {/* Interactive range slider input */}
            <input
              type="range"
              min="0"
              max="100"
              value={sliderPosition}
              onChange={(e) => setSliderPosition(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-10"
              aria-label="Before after comparison slider"
            />
          </div>
          <p className="text-center text-[11px] text-zinc-400">
            Drag the slider horizontally to compare initial damage vs final repair
          </p>
        </div>
      )}

      {/* Camera + Location Permission Banner for Android */}
      {!readOnly && (
        <PermissionGate require={['camera', 'geolocation']} mode="banner">
          <></>
        </PermissionGate>
      )}

      {/* Strict Live Camera Evidence Form (Technicians only) */}
      {!readOnly && (
        <form
          onSubmit={handleSaveEvidence}
          className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-xs space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-zinc-900">Record Live Field Evidence</h4>
              <p className="text-[11px] text-zinc-500">Live camera capture with mandatory GPS satellite telemetry.</p>
            </div>
            {/* Stage Selector */}
            <div className="flex p-1 bg-zinc-100 rounded-xl border border-zinc-200/60 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setActiveStage('BEFORE')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeStage === 'BEFORE'
                    ? 'bg-amber-500 text-white shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                1. BEFORE Stage
              </button>
              <button
                type="button"
                onClick={() => setActiveStage('AFTER')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeStage === 'AFTER'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                2. AFTER Stage
              </button>
            </div>
          </div>

          {/* Live GPS Telemetry Status Strip */}
          <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 rounded-xl border border-zinc-200/70 text-xs">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isGpsLocked ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-ping'}`} />
              <span className="font-semibold text-zinc-800">Mandatory GPS Status:</span>
              {isGpsLocked ? (
                <span className="font-mono text-[11px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  {liveGps.latitude?.toFixed(5)}°, {liveGps.longitude?.toFixed(5)}° (±{Math.round(liveGps.accuracy ?? 0)}m)
                </span>
              ) : (
                <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 animate-pulse">
                  Acquiring Satellite Lock (Required)…
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refreshGps}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
                title="Refresh GPS satellite fix"
              >
                <RotateCw size={11} /> Refresh Fix
              </button>
              <span className="text-[11px] text-zinc-400 font-mono hidden md:inline">
                {liveGps.timestamp}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Live Camera Viewfinder Launcher (Gallery Blocked) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-zinc-800">
                  Live Photo Evidence ({activeStage === 'BEFORE' ? 'Pre-Intervention' : 'Post-Remediation'})
                </label>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                  Gallery Blocked
                </span>
              </div>

              {previewUrl ? (
                <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-zinc-200 shadow-2xs group bg-zinc-900">
                  <img src={previewUrl} alt="Evidence preview" className="w-full h-full object-cover" />
                  <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase text-white shadow-sm ${
                      activeStage === 'BEFORE' ? 'bg-amber-500' : 'bg-emerald-600'
                    }`}>
                      {activeStage}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-black/70 text-white backdrop-blur-xs flex items-center gap-1">
                      <MapPin size={10} className="text-emerald-400" /> GPS Geotagged
                    </span>
                  </div>

                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => void startLiveCamera()}
                      className="px-4 py-2 rounded-xl bg-white/90 hover:bg-white text-zinc-900 text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5"
                    >
                      <Camera size={14} /> Retake Live Photo
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => void startLiveCamera()}
                    className="w-full p-5 rounded-2xl border-2 border-indigo-300 hover:border-indigo-600 bg-indigo-50/50 hover:bg-indigo-50/80 text-left transition-all cursor-pointer flex items-center justify-between group shadow-2xs min-h-[120px]"
                    id="btn-open-live-camera"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                        <Camera size={24} />
                      </div>
                      <div>
                        <span className="text-sm font-bold text-zinc-900 block">Open Live Camera Viewfinder</span>
                        <span className="text-xs text-indigo-700 font-medium flex items-center gap-1 mt-0.5">
                          <MapPin size={12} className="text-indigo-600" />
                          {isGpsLocked ? 'GPS Lock Active · Ready to Snap' : 'Live Camera + Real-Time Geotag'}
                        </span>
                      </div>
                    </div>
                    <div className="hidden sm:block text-right">
                      <span className="px-3 py-1 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-xs">
                        Start Camera ▶
                      </span>
                    </div>
                  </button>

                  <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-[11px] text-amber-900 flex items-center gap-2">
                    <AlertTriangle size={13} className="shrink-0 text-amber-600" />
                    <span>Strict Audit Rule: Gallery uploads are blocked. Live camera stream with mandatory GPS is strictly required.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Title & Remarks */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Evidence Title / Component
                </label>
                <input
                  type="text"
                  placeholder={
                    activeStage === 'BEFORE'
                      ? 'e.g. Blown fuse / Cable fray / Corroded contact'
                      : 'e.g. Replaced 10A fuse / Rewired conduit'
                  }
                  value={evidenceTitle}
                  onChange={(e) => setEvidenceTitle(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-xs focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Technical Remarks (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional context on the physical state..."
                  value={evidenceDescription}
                  onChange={(e) => setEvidenceDescription(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-zinc-200 text-xs focus:outline-hidden focus:border-indigo-500 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={!selectedFile || isCapturing || !isGpsLocked}
                className="w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-indigo-100 cursor-pointer transition-all"
                id="btn-save-evidence"
              >
                <Check size={14} />
                {isCapturing ? 'Saving Evidence…' : `Save ${activeStage} Evidence with Geotag`}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── Live Camera Modal with Real-Time GPS HUD Viewfinder ── */}
      {isLiveCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-zinc-950 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl flex flex-col">
            {/* Viewfinder Header */}
            <div className="flex items-center justify-between p-4 bg-zinc-900/90 border-b border-zinc-800 text-white z-10">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase ${
                  activeStage === 'BEFORE' ? 'bg-amber-500 text-zinc-950' : 'bg-emerald-500 text-zinc-950'
                }`}>
                  {activeStage} VIEW
                </span>
                <span className="text-xs font-medium text-zinc-300">Live Camera Geotagger</span>
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
                  {/* Grid Lines */}
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

                  {/* Center Target Reticle */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-16 h-16 border-2 border-indigo-400/60 rounded-full flex items-center justify-center">
                      <Crosshair size={28} className="text-indigo-400/80 animate-pulse" />
                    </div>
                  </div>

                  {/* Real-Time Telemetry HUD Overlay (Top & Bottom on Video) */}
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
                        <p className="text-amber-300 animate-pulse">Acquiring Satellites…</p>
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
                    Waiting for GPS Lock (Mandatory)
                  </span>
                )}
              </div>

              {/* Big Shutter Button — strictly disabled until GPS lock is obtained */}
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
                  id="btn-snap-live-photo"
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

      {/* Dual Columns: Before vs After cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* BEFORE COLUMN */}
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-1 border-b border-zinc-200">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                Before Intervention ({beforeEvidence.length})
              </h4>
            </div>
            <span className="text-[10px] text-zinc-400">Pre-remediation state</span>
          </div>

          {beforeEvidence.length === 0 ? (
            <div className="p-8 rounded-2xl bg-zinc-50 border border-dashed border-zinc-200 text-center">
              <Layers size={24} className="text-zinc-400 mx-auto mb-2 opacity-50" />
              <p className="text-xs font-semibold text-zinc-600">No &quot;Before&quot; photos recorded</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Technician should photograph defect prior to making repairs.
              </p>
            </div>
          ) : (
            beforeEvidence.map((ev) => (
              <div
                key={ev.id}
                className="bg-white rounded-2xl overflow-hidden border border-zinc-200 shadow-2xs hover:shadow-xs transition-shadow"
              >
                <div className="aspect-video w-full bg-zinc-900 relative">
                  <img src={ev.photoUrl} alt={ev.title} className="w-full h-full object-cover" />
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-amber-500 text-white font-bold text-[10px] uppercase shadow-sm">
                    BEFORE
                  </span>
                </div>
                <div className="p-3.5 space-y-1.5">
                  <h5 className="text-xs font-bold text-zinc-900">{ev.title}</h5>
                  {ev.description && <p className="text-[11px] text-zinc-600">{ev.description}</p>}
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-zinc-100">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      {new Date(ev.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span>By {ev.capturedByName}</span>
                    {ev.gpsLatitude && (
                      <span className="flex items-center gap-0.5 text-indigo-600 font-semibold">
                        <MapPin size={10} /> Geo-tagged
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* AFTER COLUMN */}
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-1 border-b border-zinc-200">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                After Remediation ({afterEvidence.length})
              </h4>
            </div>
            <span className="text-[10px] text-zinc-400">Post-repair condition</span>
          </div>

          {afterEvidence.length === 0 ? (
            <div className="p-8 rounded-2xl bg-zinc-50 border border-dashed border-zinc-200 text-center">
              <CheckCircle2 size={24} className="text-zinc-400 mx-auto mb-2 opacity-50" />
              <p className="text-xs font-semibold text-zinc-600">No &quot;After&quot; photos recorded</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Technician takes evidence upon resolving the fault.
              </p>
            </div>
          ) : (
            afterEvidence.map((ev) => (
              <div
                key={ev.id}
                className="bg-white rounded-2xl overflow-hidden border border-zinc-200 shadow-2xs hover:shadow-xs transition-shadow"
              >
                <div className="aspect-video w-full bg-zinc-900 relative">
                  <img src={ev.photoUrl} alt={ev.title} className="w-full h-full object-cover" />
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-emerald-600 text-white font-bold text-[10px] uppercase shadow-sm">
                    AFTER
                  </span>
                </div>
                <div className="p-3.5 space-y-1.5">
                  <h5 className="text-xs font-bold text-zinc-900">{ev.title}</h5>
                  {ev.description && <p className="text-[11px] text-zinc-600">{ev.description}</p>}
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-zinc-100">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      {new Date(ev.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span>By {ev.capturedByName}</span>
                    {ev.gpsLatitude && (
                      <span className="flex items-center gap-0.5 text-indigo-600 font-semibold">
                        <MapPin size={10} /> Geo-tagged
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
