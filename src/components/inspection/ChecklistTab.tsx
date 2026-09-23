import type { ChecklistItemRecord, InspectionResultRecord } from '../../types/db.types';
import { useState } from 'react';
import { CheckCircle2, Volume2, Mic, Camera, XCircle, ChevronDown } from 'lucide-react';
import { readAloud } from '@/lib/speech/speechService';
import { useLanguageStore } from '@/stores/languageStore';
import VoiceNoteRecorder from './VoiceNoteRecorder';
import { queueMedia } from '@/lib/db/repositories/media';
import { useAuthStore } from '@/stores/authStore';

interface Props {
  items: ChecklistItemRecord[];
  results: Record<string, InspectionResultRecord>;
  onUpdate: (item: ChecklistItemRecord, value: string) => Promise<void>;
  filterType?: 'NUMERIC' | 'other';
  readOnly?: boolean;
}

export default function ChecklistTab({ items, results, onUpdate, filterType, readOnly }: Props) {
  const displayItems = filterType === 'NUMERIC'
    ? items.filter(i => i.type === 'NUMERIC')
    : filterType === 'other'
    ? items.filter(i => i.type !== 'NUMERIC')
    : items;

  if (displayItems.length === 0) {
    return (
      <div className="text-center text-zinc-400 py-16 bg-white rounded-2xl border border-zinc-200/80 p-8 shadow-sm">
        <p className="font-semibold text-sm">No {filterType === 'NUMERIC' ? 'measurement' : 'checklist'} items for this inspection.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {displayItems.map(item => (
        <ChecklistItemCard
          key={item.id}
          item={item}
          result={results[item.id]}
          onUpdate={(value) => onUpdate(item, value)}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

function ChecklistItemCard({
  item,
  result,
  onUpdate,
  readOnly,
}: {
  item: ChecklistItemRecord;
  result?: InspectionResultRecord;
  onUpdate: (value: string) => Promise<void>;
  readOnly?: boolean;
}) {
  const { user } = useAuthStore();
  const { language, t } = useLanguageStore();
  const [isReading, setIsReading] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [capturingPhoto, setCapturingPhoto] = useState(false);

  const value = result?.value ?? '';

  async function handleRead() {
    setIsReading(true);
    await readAloud(item.question, language, () => setIsReading(false));
  }

  async function handleLiveCameraCapture() {
    if (!user) return;
    setCapturingPhoto(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;
      await video.play();

      // Small delay to ensure frame is loaded
      await new Promise((r) => setTimeout(r, 400));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      // Stop tracks
      stream.getTracks().forEach((t) => t.stop());

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9)
      );

      if (blob) {
        const file = new File([blob], `item_${item.id}_${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        await queueMedia({
          inspectionId: item.inspectionId,
          checklistItemId: item.id,
          file,
          fileName: file.name,
          userId: user.id,
        });
      }
    } catch (err) {
      console.warn('Live camera capture for checklist error:', err);
      alert('Camera access required. Gallery uploads are strictly blocked.');
    } finally {
      setCapturingPhoto(false);
    }
  }

  return (
    <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-sm space-y-3" id={`checklist-item-${item.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-zinc-900 font-bold text-sm leading-snug">{item.question}</p>
            {item.required && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-rose-50 text-rose-600 border border-rose-200 shrink-0">
                {t('term.required')}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleRead()}
          disabled={isReading}
          className="h-8 w-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 shrink-0"
          title={t('term.readAloud')}
          aria-label={t('term.readAloud')}
        >
          <Volume2 size={16} className={isReading ? 'text-indigo-600 animate-pulse' : ''} />
        </button>
      </div>

      <ChecklistInput item={item} value={value} onChange={onUpdate} readOnly={readOnly} />

      {/* Item Attachments Bar: Voice Note & Photo — hidden in readOnly mode */}
      {!readOnly && (
        <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowVoiceRecorder(!showVoiceRecorder)}
              className="h-7 px-2 rounded-lg font-bold text-[11px] bg-zinc-50 hover:bg-zinc-100 text-zinc-600 flex items-center gap-1 border border-zinc-200 cursor-pointer"
            >
              <Mic size={12} className="text-indigo-600" />
              {t('term.voiceNote')}
            </button>
            <button
              type="button"
              onClick={() => void handleLiveCameraCapture()}
              disabled={capturingPhoto}
              className="h-7 px-2 rounded-lg font-bold text-[11px] bg-zinc-50 hover:bg-zinc-100 text-zinc-600 flex items-center gap-1 border border-zinc-200 cursor-pointer disabled:opacity-50"
              title="Capture Live Photo (Gallery blocked)"
            >
              <Camera size={12} className="text-indigo-600" />
              {capturingPhoto ? 'Snapping...' : 'Live Photo'}
            </button>
          </div>

          {result && (
            <p className="text-[11px] font-medium text-zinc-400">
              Last updated: {new Date(result.updatedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
      )}
      {readOnly && result && (
        <div className="pt-1 border-t border-zinc-100">
          <p className="text-[11px] font-medium text-zinc-400">
            Last updated: {new Date(result.updatedAt).toLocaleTimeString()}
          </p>
        </div>
      )}

      {showVoiceRecorder && (
        <div className="pt-2">
          <VoiceNoteRecorder
            inspectionId={item.inspectionId}
            checklistItemId={item.id}
            onSaved={() => setShowVoiceRecorder(false)}
            onCancel={() => setShowVoiceRecorder(false)}
          />
        </div>
      )}
    </div>
  );
}

function ChecklistInput({
  item,
  value,
  onChange,
  readOnly,
}: {
  item: ChecklistItemRecord;
  value: string;
  onChange: (value: string) => Promise<void>;
  readOnly?: boolean;
}) {
  switch (item.type) {
    case 'PASS_FAIL':
      return (
        <div className="flex gap-2">
          <button
            onClick={() => !readOnly && onChange('PASS')}
            disabled={readOnly}
            className={`flex-1 h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all border ${readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} ${
              value === 'PASS'
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
            }`}
            id={`result-pass-${item.id}`}
          >
            <CheckCircle2 size={16} /> PASS
          </button>
          <button
            onClick={() => !readOnly && onChange('FAIL')}
            disabled={readOnly}
            className={`flex-1 h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all border ${readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} ${
              value === 'FAIL'
                ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
            }`}
            id={`result-fail-${item.id}`}
          >
            <XCircle size={16} /> FAIL
          </button>
        </div>
      );

    case 'GOOD_DAMAGED':
      return (
        <div className="flex gap-2">
          <button
            onClick={() => !readOnly && onChange('GOOD')}
            disabled={readOnly}
            className={`flex-1 h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all border ${readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} ${
              value === 'GOOD'
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
            }`}
            id={`result-good-${item.id}`}
          >
            <CheckCircle2 size={16} /> GOOD
          </button>
          <button
            onClick={() => !readOnly && onChange('DAMAGED')}
            disabled={readOnly}
            className={`flex-1 h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all border ${readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} ${
              value === 'DAMAGED'
                ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
            }`}
            id={`result-damaged-${item.id}`}
          >
            <XCircle size={16} /> DAMAGED
          </button>
        </div>
      );

    case 'BOOLEAN':
      return (
        <div className="flex gap-2">
          <button
            onClick={() => !readOnly && onChange('YES')}
            disabled={readOnly}
            className={`flex-1 h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all border ${readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} ${
              value === 'YES'
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
            }`}
            id={`result-yes-${item.id}`}
          >
            YES
          </button>
          <button
            onClick={() => !readOnly && onChange('NO')}
            disabled={readOnly}
            className={`flex-1 h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all border ${readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} ${
              value === 'NO'
                ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
            }`}
            id={`result-no-${item.id}`}
          >
            NO
          </button>
        </div>
      );

    case 'NUMERIC':
      return (
        <div className="flex gap-2 items-center">
          <input
            type="number"
            readOnly={readOnly}
            disabled={readOnly}
            className={`flex-1 h-10 px-3.5 bg-white border border-zinc-200 rounded-xl text-sm font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all ${readOnly ? 'opacity-70 cursor-not-allowed bg-zinc-50' : ''}`}
            placeholder={item.unit ? `Enter value (${item.unit})` : 'Enter value'}
            defaultValue={value}
            onBlur={e => { if (!readOnly && e.target.value !== value) onChange(e.target.value); }}
            min={item.minValue}
            max={item.maxValue}
            id={`result-numeric-${item.id}`}
          />
          {item.unit && (
            <span className="text-zinc-500 font-mono font-bold text-xs px-2">{item.unit}</span>
          )}
        </div>
      );

    case 'SELECT':
      return (
        <div className="relative">
          <select
            className={`w-full h-10 px-3.5 pr-10 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-900 appearance-none focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all ${readOnly ? 'opacity-70 cursor-not-allowed bg-zinc-50' : 'cursor-pointer'}`}
            value={value}
            disabled={readOnly}
            onChange={e => !readOnly && onChange(e.target.value)}
            id={`result-select-${item.id}`}
          >
            <option value="">Select an option…</option>
            {item.options?.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        </div>
      );

    case 'TEXT':
    default:
      return (
        <textarea
          readOnly={readOnly}
          disabled={readOnly}
          className={`w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-900 resize-none focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all ${readOnly ? 'opacity-70 cursor-not-allowed bg-zinc-50' : ''}`}
          rows={3}
          placeholder="Enter observation notes…"
          defaultValue={value}
          onBlur={e => { if (!readOnly && e.target.value !== value) onChange(e.target.value); }}
          id={`result-text-${item.id}`}
        />
      );
  }
}

