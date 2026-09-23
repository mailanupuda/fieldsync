import { useState } from 'react';
import { useAudioRecorder } from '../../lib/media/useAudioRecorder';
import { queueVoiceNote } from '../../lib/db/repositories/voiceNotes';
import { useAuthStore } from '../../stores/authStore';
import { syncManager } from '../../lib/sync/syncManager';
import { Mic, Square, RotateCcw, Check, X, AlertTriangle, Play, Pause } from 'lucide-react';

interface Props {
  inspectionId: string;
  checklistItemId?: string;
  checklistQuestion?: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function VoiceNoteRecorderModal({
  inspectionId,
  checklistItemId,
  checklistQuestion,
  onClose,
  onSaved,
}: Props) {
  const { user } = useAuthStore();
  const {
    isRecording,
    recordingDuration,
    audioBlob,
    audioUrl,
    isSupported,
    errorMessage,
    startRecording,
    stopRecording,
    resetRecording,
  } = useAudioRecorder();

  const [saving, setSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    if (!audioUrl) return;
    if (isPlaying && audioElement) {
      audioElement.pause();
      setIsPlaying(false);
    } else {
      const audio = audioElement || new Audio(audioUrl);
      if (!audioElement) {
        audio.onended = () => setIsPlaying(false);
        setAudioElement(audio);
      }
      audio.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const handleSave = async () => {
    if (!audioBlob || !user) return;
    setSaving(true);
    try {
      await queueVoiceNote({
        inspectionId,
        checklistItemId,
        technicianId: user.id,
        blob: audioBlob,
        duration: recordingDuration,
      });

      // Trigger sync if online (will automatically queue offline if disconnected)
      void syncManager.syncNow();

      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      console.error('[VoiceNoteRecorderModal] Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-zinc-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
              <Mic size={18} />
            </div>
            <div>
              <h3 className="font-bold text-base text-zinc-900 leading-tight">Record Voice Note</h3>
              <p className="text-[11px] font-medium text-zinc-500">Offline Field Audio Observation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {checklistQuestion && (
          <div className="my-4 p-3 bg-zinc-50 rounded-2xl border border-zinc-200/70 text-xs">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
              Checklist Item
            </span>
            <p className="font-semibold text-zinc-800">{checklistQuestion}</p>
          </div>
        )}

        {!isSupported && (
          <div className="my-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={18} />
            <div className="text-xs text-rose-800">
              <p className="font-bold">Audio Recording Unavailable</p>
              <p className="mt-1">
                Your current device or browser does not expose the MediaRecorder API. You can still type notes and capture photos offline.
              </p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="my-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Recording Controls */}
        {isSupported && (
          <div className="py-6 flex flex-col items-center justify-center">
            {/* Timer Display */}
            <div className="text-4xl font-black font-mono tracking-wider text-zinc-900 mb-4">
              {formatDuration(recordingDuration)}
            </div>

            {/* Pulsing indicator when recording */}
            {isRecording && (
              <div className="flex items-center gap-2 mb-6">
                <span className="w-3 h-3 rounded-full bg-rose-600 animate-ping" />
                <span className="text-xs font-bold text-rose-600 tracking-wider uppercase">Recording Audio...</span>
              </div>
            )}

            {/* Large Interactive Button */}
            {!audioBlob ? (
              !isRecording ? (
                <button
                  onClick={startRecording}
                  className="h-20 w-20 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white shadow-lg shadow-rose-200 flex items-center justify-center transition-all cursor-pointer"
                  id="btn-start-record-voice"
                >
                  <Mic size={32} />
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="h-20 w-20 rounded-full bg-zinc-900 hover:bg-black active:scale-95 text-white shadow-lg shadow-zinc-300 flex items-center justify-center transition-all cursor-pointer animate-pulse"
                  id="btn-stop-record-voice"
                >
                  <Square size={28} className="fill-white" />
                </button>
              )
            ) : (
              /* Preview State */
              <div className="w-full space-y-4">
                <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handlePlayPause}
                      className="w-12 h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-xs cursor-pointer"
                      id="btn-play-voice-preview"
                    >
                      {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
                    </button>
                    <div>
                      <p className="text-xs font-bold text-zinc-900">Voice Note Preview</p>
                      <p className="text-[11px] font-mono text-zinc-500">{formatDuration(recordingDuration)}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Ready to save
                  </span>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={resetRecording}
                    className="flex-1 h-12 rounded-xl border border-zinc-200 hover:bg-zinc-50 font-bold text-xs text-zinc-700 flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    id="btn-rerecord-voice"
                  >
                    <RotateCcw size={16} /> Re-record
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-emerald-200 transition-colors"
                    id="btn-save-voice"
                  >
                    <Check size={16} /> {saving ? 'Saving...' : 'Save Offline'}
                  </button>
                </div>
              </div>
            )}

            <p className="text-[11px] font-medium text-zinc-400 mt-6 text-center">
              ● Saved locally in IndexedDB immediately. Will upload automatically when online.
            </p>
          </div>
        )}

        <div className="pt-3 border-t border-zinc-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
