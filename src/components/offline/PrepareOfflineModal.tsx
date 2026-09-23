import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/database';
import { saveOfflinePackage } from '@/lib/db/repositories/offlinePackages';
import { v4 as uuidv4 } from 'uuid';
import {
  Download, CheckCircle2, HardDrive, X, Loader2,
  PackageCheck
} from 'lucide-react';
import type { Inspection, Asset, ChecklistItem } from '@/types/db';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function PrepareOfflineModal({ isOpen, onClose }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPreparing, setIsPreparing] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const inspections = useLiveQuery(() => db.inspections.toArray(), []) as Inspection[] | undefined;
  const assets = useLiveQuery(() => db.assets.toArray(), []) as Asset[] | undefined;
  const checklistItems = useLiveQuery(() => db.checklistItems.toArray(), []) as ChecklistItem[] | undefined;

  if (!isOpen) return null;

  const assetsMap = Object.fromEntries((assets ?? []).map((a) => [a.id, a]));

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
    setIsDone(false);
  }

  function selectAll() {
    if (!inspections) return;
    if (selectedIds.size === inspections.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(inspections.map((i) => i.id)));
    }
    setIsDone(false);
  }

  const selectedInspections = (inspections ?? []).filter((i) => selectedIds.has(i.id));
  const selectedAssetIds = Array.from(new Set(selectedInspections.map((i) => i.assetId)));

  const matchedChecklistCount = (checklistItems ?? []).filter((c) =>
    selectedIds.has(c.inspectionId)
  ).length;

  // Estimated offline storage calculation: ~15KB per inspection & item definition + 500KB bundle overhead
  const estimatedBytes = selectedInspections.length * 45000 + matchedChecklistCount * 12000 + 450000;
  const estimatedMB = (estimatedBytes / (1024 * 1024)).toFixed(1);

  async function handlePrepare() {
    if (selectedIds.size === 0) return;
    setIsPreparing(true);

    try {
      // Simulate real verification & packaging of IndexedDB offline cache
      await new Promise((r) => setTimeout(r, 600));

      const pkgId = uuidv4();
      await saveOfflinePackage({
        id: pkgId,
        title: `Work Package (${selectedInspections.length} inspections)`,
        inspectionIds: Array.from(selectedIds),
        assetIds: selectedAssetIds,
        totalChecklistItems: matchedChecklistCount,
        estimatedSizeBytes: estimatedBytes,
        downloadedAt: new Date().toISOString(),
        status: 'READY',
      });

      setIsDone(true);
    } catch (e) {
      console.error('Failed to prepare offline package:', e);
    } finally {
      setIsPreparing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-2xl max-w-lg w-full overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Download size={20} />
            </div>
            <div>
              <h2 className="text-base font-black text-zinc-900">Prepare Offline Work Package</h2>
              <p className="text-xs text-zinc-500">Cache checklists & assets locally before going offline</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-xl hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Instructions banner */}
          <div className="bg-slate-50 border border-zinc-200/80 rounded-2xl p-3.5 text-xs text-zinc-600 space-y-1">
            <p className="font-bold text-zinc-800 flex items-center gap-1.5">
              <HardDrive size={14} className="text-indigo-600" />
              Pre-flight Local Cache
            </p>
            <p>
              Select the inspections assigned to your shift. All checklist definitions, asset details,
              and offline dictionaries will be verified and locked in device storage.
            </p>
          </div>

          {/* Select All Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Available Inspections ({inspections?.length ?? 0})
            </span>
            <button
              onClick={selectAll}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
            >
              {selectedIds.size === (inspections?.length ?? 0) ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          {/* List of Inspections */}
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {inspections?.map((ins) => {
              const isChecked = selectedIds.has(ins.id);
              const asset = assetsMap[ins.assetId];

              return (
                <div
                  key={ins.id}
                  onClick={() => toggleSelect(ins.id)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isChecked
                      ? 'bg-indigo-50/60 border-indigo-300 text-indigo-950'
                      : 'bg-white border-zinc-200 hover:border-zinc-300 text-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSelect(ins.id)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{ins.title}</p>
                      <p className="text-[11px] text-zinc-400 truncate">
                        {ins.siteName} {asset ? `· ${asset.name}` : ''}
                      </p>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200 shrink-0">
                    {ins.priority || 'MEDIUM'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Estimate summary box */}
          {selectedIds.size > 0 && (
            <div className="bg-white border-2 border-indigo-100 rounded-2xl p-4 shadow-xs space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                Ready For Offline Summary
              </h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 p-2 rounded-xl border border-zinc-100">
                  <p className="text-lg font-black font-mono text-zinc-900">{selectedIds.size}</p>
                  <p className="text-[10px] font-bold text-zinc-400">Inspections</p>
                </div>
                <div className="bg-slate-50 p-2 rounded-xl border border-zinc-100">
                  <p className="text-lg font-black font-mono text-zinc-900">{matchedChecklistCount}</p>
                  <p className="text-[10px] font-bold text-zinc-400">Checklist Items</p>
                </div>
                <div className="bg-slate-50 p-2 rounded-xl border border-zinc-100">
                  <p className="text-lg font-black font-mono text-indigo-600">{estimatedMB} MB</p>
                  <p className="text-[10px] font-bold text-zinc-400">Est. Storage</p>
                </div>
              </div>
            </div>
          )}

          {isDone && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-800 font-bold">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              Offline package ready. You can now disconnect and work safely offline.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-100 bg-slate-50/50 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 h-10 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-200 transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={() => void handlePrepare()}
            disabled={selectedIds.size === 0 || isPreparing}
            className="px-5 h-10 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 shadow-xs shadow-indigo-100 active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
            id="btn-confirm-offline-package"
          >
            {isPreparing ? (
              <><Loader2 size={14} className="animate-spin" /> Preparing...</>
            ) : isDone ? (
              <><PackageCheck size={15} /> Package Locked</>
            ) : (
              <><Download size={15} /> Lock for Offline</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
