import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db/database';
import { saveOfflinePackage } from '../../lib/db/repositories/offlinePackages';
import { v4 as uuidv4 } from 'uuid';
import { DownloadCloud, CheckCircle2, X, Package, Database, ShieldCheck } from 'lucide-react';
import type { Inspection, Asset } from '@/types/db';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function OfflinePackageModal({ isOpen, onClose }: Props) {
  const [selectedInspectionIds, setSelectedInspectionIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);

  const inspections = useLiveQuery(() => db.inspections.toArray(), []);
  const assets = useLiveQuery(() => db.assets.toArray(), []);
  const checklistItems = useLiveQuery(() => db.checklistItems.toArray(), []);

  // Pre-select all active inspections by default
  useEffect(() => {
    if (inspections && inspections.length > 0 && selectedInspectionIds.size === 0) {
      setSelectedInspectionIds(new Set(inspections.map((i) => i.id)));
    }
  }, [inspections]);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    const next = new Set(selectedInspectionIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedInspectionIds(next);
  };

  const selectedInspections = (inspections || []).filter((i) => selectedInspectionIds.has(i.id));
  const relevantChecklistCount = (checklistItems || []).filter((c) =>
    selectedInspectionIds.has(c.inspectionId)
  ).length;

  // Estimated storage (based on inspection records, checklist definitions, Yjs docs, photos/media definitions)
  const estimatedMb = Math.max(
    1,
    Math.round(selectedInspectionIds.size * 2.5 + relevantChecklistCount * 0.1)
  );

  const handlePreparePackage = async () => {
    setDownloading(true);
    try {
      const packageId = uuidv4();
      const assetIds = Array.from(new Set(selectedInspections.map((i) => i.assetId)));

      await saveOfflinePackage({
        id: packageId,
        title: `Work Package (${selectedInspections.length} inspections)`,
        inspectionIds: Array.from(selectedInspectionIds),
        assetIds,
        totalChecklistItems: relevantChecklistCount,
        estimatedSizeBytes: estimatedMb * 1024 * 1024,
        downloadedAt: new Date().toISOString(),
        status: 'READY',
      });

      setDownloadComplete(true);
    } catch (err) {
      console.error('[OfflinePackageModal] Prepare package error:', err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-zinc-200 p-6 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
              <Package size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-zinc-900 leading-tight">Prepare Offline Work</h3>
              <p className="text-[11px] font-medium text-zinc-500">
                Cache inspections and data before entering zero-connectivity areas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {downloadComplete ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 size={36} />
            </div>
            <div>
              <h4 className="text-lg font-black text-zinc-900">Offline Package Ready</h4>
              <p className="text-xs text-zinc-600 mt-1 max-w-sm mx-auto">
                All selected inspection checklists, assets, and language dictionaries are stored locally in IndexedDB.
              </p>
            </div>

            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-left text-xs space-y-1.5 max-w-sm mx-auto">
              <div className="flex justify-between text-zinc-600">
                <span>Inspections cached:</span>
                <span className="font-bold font-mono text-zinc-900">{selectedInspections.length}</span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>Checklist questions:</span>
                <span className="font-bold font-mono text-zinc-900">{relevantChecklistCount}</span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>Storage used:</span>
                <span className="font-bold font-mono text-zinc-900">~{estimatedMb} MB</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={onClose}
                className="w-full h-11 rounded-xl bg-zinc-900 hover:bg-black text-white font-bold text-xs cursor-pointer transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-2xl flex items-start gap-2.5 text-xs text-indigo-900">
              <ShieldCheck size={18} className="text-indigo-600 shrink-0 mt-0.5" />
              <p>
                Select inspections for today's fieldwork. All checklists, assets, history, and language resources will be ready to work with zero Internet.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">
                Select Inspections ({selectedInspectionIds.size} selected)
              </label>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {(inspections || []).map((insp: Inspection) => {
                  const asset = assets?.find((a: Asset) => a.id === insp.assetId);
                  const isChecked = selectedInspectionIds.has(insp.id);

                  return (
                    <div
                      key={insp.id}
                      onClick={() => toggleSelect(insp.id)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isChecked
                          ? 'bg-indigo-50/40 border-indigo-200'
                          : 'bg-white border-zinc-200/80 hover:bg-zinc-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {asset && (
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white border border-zinc-200 text-zinc-700">
                              {asset.assetCode}
                            </span>
                          )}
                          <p className="text-xs font-bold text-zinc-900 truncate">{insp.title}</p>
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-0.5">{insp.siteName}</p>
                      </div>

                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-0 cursor-pointer"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Storage Estimate Box */}
            <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-800">
                <span className="flex items-center gap-1.5">
                  <Database size={14} className="text-indigo-600" />
                  Estimated Storage
                </span>
                <span className="font-mono text-indigo-600">~{estimatedMb} MB</span>
              </div>
              <div className="text-[11px] text-zinc-500 flex justify-between">
                <span>{selectedInspectionIds.size} inspections · {relevantChecklistCount} checklist items</span>
                <span>Prioritizing definitions & history</span>
              </div>
            </div>

            <button
              onClick={handlePreparePackage}
              disabled={downloading || selectedInspectionIds.size === 0}
              className="w-full h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-indigo-200 transition-all"
              id="btn-confirm-offline-work"
            >
              <DownloadCloud size={16} />
              {downloading ? 'Preparing Offline Work...' : 'READY FOR OFFLINE'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
