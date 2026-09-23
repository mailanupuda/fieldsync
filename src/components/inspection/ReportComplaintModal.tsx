import React, { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/database';
import { useAuthStore } from '@/stores/authStore';
import { createAuditEvent } from '@/lib/db/repositories/auditEvents';
import { createOperation } from '@/lib/db/repositories/operations';
import { queueMedia } from '@/lib/db/repositories/media';
import type { InspectionPriority, InspectionStatus, Inspection, ServiceCategory } from '@/types/db';
import {
  AlertTriangle,
  X,
  CheckCircle,
  RefreshCw,
  Camera,
  Mic,
  Square,
  Wifi,
  Monitor,
  Shield,
  Zap,
  Cpu,
  Layers
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (issueId: string) => void;
}

const CATEGORIES: { value: ServiceCategory; label: string; icon: React.ComponentType<{ size: number }> }[] = [
  { value: 'NETWORK', label: 'Network Support (Wi-Fi, Switches, Drops)', icon: Wifi },
  { value: 'IT_HARDWARE', label: 'IT Infrastructure (Servers, Workstations, Access)', icon: Monitor },
  { value: 'CCTV_SECURITY', label: 'CCTV & Security Maintenance (Cameras, NVR, Alarms)', icon: Shield },
  { value: 'ELECTRICAL', label: 'Electrical Service (UPS, Panels, Breakers, Lighting)', icon: Zap },
  { value: 'IOT_SYSTEMS', label: 'IoT & Telemetry (Sensors, Gateways, Controllers)', icon: Cpu },
  { value: 'FACILITY_TECH', label: 'Facility Technology Support', icon: Layers },
  { value: 'GENERAL', label: 'General Equipment & Hardware', icon: Layers },
];

export default function ReportComplaintModal({ isOpen, onClose, onSuccess }: Props) {
  const { user } = useAuthStore();
  const assets = useLiveQuery(() => db.assets.toArray(), []) ?? [];

  const [customerName, setCustomerName] = useState(user?.fullName ?? '');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState(user?.email ?? '');
  const [category, setCategory] = useState<ServiceCategory>('NETWORK');
  const [assetId, setAssetId] = useState('');
  const [title, setTitle] = useState('');
  const [siteName, setSiteName] = useState('');
  const [priority, setPriority] = useState<InspectionPriority>('HIGH');
  const [description, setDescription] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Voice note recording states
  const [isRecording, setIsRecording] = useState(false);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceDuration, setVoiceDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleAssetChange(id: string) {
    setAssetId(id);
    const selected = assets.find(a => a.id === id);
    if (selected) {
      if (selected.location && !siteName) {
        setSiteName(selected.location.split('—')[0]?.trim() || selected.location);
      }
      if (!title) {
        setTitle(`${selected.name} (${selected.assetCode}) issue reported`);
      }
    }
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      setVoiceDuration(0);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setVoiceBlob(audioBlob);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setVoiceDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.warn('Microphone access unavailable or denied:', err);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a service issue title.');
      return;
    }
    if (!siteName.trim()) {
      setError('Please provide the location.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();
      const issueId = crypto.randomUUID();

      // Look up SLA policy from local database
      const policy = await db.slaPolicies.where('priority').equals(priority).first();
      const respMin = policy?.responseMinutes ?? (priority === 'CRITICAL' ? 15 : priority === 'HIGH' ? 60 : priority === 'LOW' ? 480 : 240);
      const resMin = policy?.resolutionMinutes ?? (priority === 'CRITICAL' ? 240 : priority === 'HIGH' ? 480 : priority === 'LOW' ? 2880 : 1440);
      const responseDeadline = new Date(nowMs + respMin * 60000).toISOString();
      const resolutionDeadline = new Date(nowMs + resMin * 60000).toISOString();

      const newIssue: Inspection = {
        id: issueId,
        title: title.trim(),
        siteName: siteName.trim(),
        assetId: assetId || '',
        status: 'PENDING' as InspectionStatus,
        issueStatus: 'NEW',
        category,
        priority,
        workflowStage: 'RAISED',
        reportedBy: customerName.trim() || 'Customer',
        customerId: user?.id ?? undefined,
        customerPhone: customerPhone.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        customerNotes: description.trim() || undefined,
        responseDeadline,
        resolutionDeadline,
        escalationLevel: 0,
        assignedTo: [],
        assignedAt: now,
        localVersion: 1,
        serverVersion: 0,
        syncStatus: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };

      // 1. Put in IndexedDB
      await db.inspections.put(newIssue);

      // 2. Attach photo if provided
      if (selectedPhoto) {
        await queueMedia({
          inspectionId: issueId,
          file: selectedPhoto,
          userId: user?.id ?? 'customer',
        });
      }

      // 3. Attach voice note if provided
      if (voiceBlob) {
        const voiceId = crypto.randomUUID();
        await db.voiceNotes.put({
          id: voiceId,
          inspectionId: issueId,
          technicianId: user?.id ?? 'customer',
          fileName: `customer-voice-${Date.now()}.webm`,
          mimeType: 'audio/webm',
          duration: voiceDuration,
          localBlob: voiceBlob,
          uploadStatus: 'PENDING',
          uploadedBytes: 0,
          totalBytes: voiceBlob.size,
          createdAt: now,
          updatedAt: now,
          schemaVersion: 3,
          syncStatus: 'PENDING',
        });
      }

      // 4. Generate generic diagnostic checklist items
      const genericChecklist = [
        { question: 'Physical condition of device, mountings, and enclosures verified', type: 'GOOD_DAMAGED' as const, required: true, order: 1 },
        { question: 'Input power supply & status indicator verified operational', type: 'PASS_FAIL' as const, required: true, order: 2 },
        { question: 'Cabling, connectors, and interface terminals secure', type: 'PASS_FAIL' as const, required: true, order: 3 },
        { question: 'Diagnostic measurement / signal reading recorded', type: 'NUMERIC' as const, required: false, unit: 'units', order: 4 },
        { question: 'Functional operational test confirmed successful', type: 'PASS_FAIL' as const, required: true, order: 5 },
        { question: 'Corrective maintenance / parts replacement verified', type: 'PASS_FAIL' as const, required: true, order: 6 },
        { question: 'Field technician observations & follow-up recommendations', type: 'TEXT' as const, required: false, order: 7 },
      ];

      for (const item of genericChecklist) {
        await db.checklistItems.put({
          ...item,
          id: crypto.randomUUID(),
          inspectionId: issueId,
          createdAt: now,
        });
      }

      // 5. Store Customer Description as initial Note
      if (description.trim()) {
        await db.notes.put({
          id: crypto.randomUUID(),
          inspectionId: issueId,
          authorId: user?.id ?? 'customer',
          authorName: customerName.trim() || 'Customer',
          content: `[CUSTOMER REPORTED ISSUE]:\n${description.trim()}`,
          syncStatus: 'PENDING',
          createdAt: now,
          updatedAt: now,
        });
      }

      // 6. Create durable sync operation
      await createOperation({
        userId: user?.id ?? 'customer',
        inspectionId: issueId,
        entityType: 'inspection',
        entityId: issueId,
        operationType: 'CREATE',
        payload: {
          ...newIssue,
        },
      });

      // 7. Audit Event
      await createAuditEvent({
        userId: user?.id ?? 'customer',
        userName: customerName.trim() || 'Customer',
        entityType: 'INSPECTION',
        entityId: issueId,
        inspectionId: issueId,
        action: 'CREATED',
        metadata: {
          category,
          priority,
          reportedBy: customerName.trim() || 'Customer',
        },
      });

      setOfflineNotice('Saved offline — waiting for synchronization when network is available.');
      setTimeout(() => {
        onSuccess?.(issueId);
        onClose();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit service issue.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-zinc-900/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[88vh] sm:max-h-[90vh] my-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-100 bg-gradient-to-r from-rose-50/60 via-amber-50/40 to-indigo-50/30 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <AlertTriangle size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-zinc-900 truncate">Report Service Issue / Defect</h2>
              <p className="text-[11px] font-medium text-zinc-500 line-clamp-1">
                Log a field problem. Admin will review and assign a team.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer shrink-0 ml-2"
            id="btn-close-complaint-modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body + Pinned Footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle size={14} />
                {error}
              </div>
            )}

            {offlineNotice && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                <CheckCircle size={14} />
                {offlineNotice}
              </div>
            )}

            {/* Customer / Reporter Contact */}
            <div className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200/70 space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                1. Customer / Reporter Information
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-zinc-700 block mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full h-9 px-2.5 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                    placeholder="Enter your full name"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    id="input-customer-name"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-zinc-700 block mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    className="w-full h-9 px-2.5 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                    placeholder="+1 (555) 234-8901"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    id="input-customer-phone"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-zinc-700 block mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    className="w-full h-9 px-2.5 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                    placeholder="customer@domain.com"
                    value={customerEmail}
                    onChange={e => setCustomerEmail(e.target.value)}
                    id="input-customer-email"
                  />
                </div>
              </div>
            </div>

            {/* Service Category */}
            <div>
              <label className="text-xs font-bold text-zinc-700 block mb-1">
                Service Category <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CATEGORIES.map(cat => {
                  const Icon = cat.icon;
                  const isSelected = category === cat.value;
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setCategory(cat.value)}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-rose-50/80 border-rose-400 text-rose-950 font-bold shadow-2xs ring-1 ring-rose-400'
                          : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-rose-600 text-white' : 'bg-zinc-100 text-zinc-500'}`}>
                        <Icon size={14} />
                      </div>
                      <span className="text-xs truncate">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Issue Title */}
            <div>
              <label className="text-xs font-bold text-zinc-700 block mb-1">
                Issue Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                className="w-full h-10 px-3 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                placeholder="e.g. Wi-Fi unavailable in second-floor laboratory"
                value={title}
                onChange={e => setTitle(e.target.value)}
                id="input-complaint-title"
              />
            </div>

            {/* Location & Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-zinc-700 block mb-1">
                  Location / Facility <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  className="w-full h-10 px-3 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="e.g. Second Floor — Laboratory 2"
                  value={siteName}
                  onChange={e => setSiteName(e.target.value)}
                  id="input-complaint-site"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-700 block mb-1">
                  Severity / Priority
                </label>
                <select
                  className="w-full h-10 px-3 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                  value={priority}
                  onChange={e => setPriority(e.target.value as InspectionPriority)}
                  id="select-complaint-priority"
                >
                  <option value="LOW">LOW — Routine request</option>
                  <option value="MEDIUM">MEDIUM — Standard maintenance</option>
                  <option value="HIGH">HIGH — Urgent service impact</option>
                  <option value="CRITICAL">CRITICAL — Complete outage / safety risk</option>
                </select>
              </div>
            </div>

            {/* Optional Asset / Equipment */}
            <div>
              <label className="text-xs font-bold text-zinc-700 block mb-1">
                Affected Equipment / Asset <span className="text-zinc-400 font-normal">(optional)</span>
              </label>
              <select
                className="w-full h-10 px-3 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                value={assetId}
                onChange={e => handleAssetChange(e.target.value)}
                id="select-complaint-asset"
              >
                <option value="">— Select equipment or leave blank —</option>
                {assets.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.assetCode}) — {a.location}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-bold text-zinc-700 block mb-1">
                Problem Description &amp; Symptoms
              </label>
              <textarea
                rows={3}
                className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none font-medium"
                placeholder="Describe what is failing, affected users, error lights, or previous troubleshooting..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                id="input-complaint-desc"
              />
            </div>

            {/* Evidence Attachments: Photo + Voice Note */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Photo Capture */}
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 space-y-2">
                <span className="text-[11px] font-bold text-zinc-700 flex items-center gap-1.5">
                  <Camera size={13} className="text-zinc-500" />
                  Attach Photo Evidence (Offline)
                </span>
                <label className="h-9 px-3 rounded-lg border border-dashed border-zinc-300 bg-white hover:bg-zinc-50 text-xs font-bold text-zinc-600 flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                  <Camera size={13} />
                  <span>{selectedPhoto ? selectedPhoto.name : 'Select or Take Photo'}</span>
                  <input type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
                </label>
                {photoPreview && (
                  <div className="relative rounded-lg overflow-hidden border border-zinc-200 w-20 h-16">
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => { setSelectedPhoto(null); setPhotoPreview(null); }}
                      className="absolute top-1 right-1 p-0.5 bg-black/60 text-white rounded cursor-pointer"
                    >
                      <X size={10} />
                    </button>
                  </div>
                )}
              </div>

              {/* Voice Note Recording */}
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 space-y-2">
                <span className="text-[11px] font-bold text-zinc-700 flex items-center gap-1.5">
                  <Mic size={13} className="text-zinc-500" />
                  Record Voice Note (Offline)
                </span>
                <div className="flex items-center gap-2">
                  {!isRecording ? (
                    <button
                      type="button"
                      onClick={startRecording}
                      className="h-9 px-3 rounded-lg bg-white hover:bg-zinc-100 border border-zinc-200 text-xs font-bold text-zinc-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Mic size={13} className="text-rose-500" />
                      <span>Record Audio</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="h-9 px-3 rounded-lg bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer animate-pulse"
                    >
                      <Square size={12} />
                      <span>Stop ({voiceDuration}s)</span>
                    </button>
                  )}
                  {voiceBlob && !isRecording && (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 flex items-center gap-1">
                      <CheckCircle size={11} /> {voiceDuration}s voice note
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Workflow Note */}
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 text-[11px] text-zinc-500 space-y-1">
              <p className="font-semibold text-zinc-700">Customer Workflow Note:</p>
              <p>
                • Saved locally in IndexedDB immediately. Works 100% offline.
              </p>
              <p>
                • <strong>Admin</strong> will review and assign an authorized <strong>Supervisor</strong> &amp; <strong>Technician</strong> to perform field work.
              </p>
            </div>
          </div>

          {/* Fixed/Pinned Modal Actions Footer */}
          <div className="p-3.5 sm:p-4 bg-zinc-50/95 border-t border-zinc-100 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim() || !siteName.trim()}
              className="h-10 px-5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-rose-200"
              id="btn-submit-complaint"
            >
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle size={13} />}
              {saving ? 'Saving Offline…' : 'Submit Service Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
