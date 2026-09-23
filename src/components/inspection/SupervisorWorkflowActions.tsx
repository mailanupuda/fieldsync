import { useState } from 'react';
import { db } from '@/lib/db/database';
import { useAuthStore } from '@/stores/authStore';
import { createAuditEvent } from '@/lib/db/repositories/auditEvents';
import type { Inspection } from '@/types/db';
import {
  ClipboardCheck,
  Send,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  FileCheck,
} from 'lucide-react';

interface Props {
  inspection: Inspection;
  onUpdated?: () => void;
}

export default function SupervisorWorkflowActions({ inspection, onUpdated }: Props) {
  const { user } = useAuthStore();
  const [coordinationNotes, setCoordinationNotes] = useState(inspection.supervisorNotes ?? '');
  const [resolutionSummary, setResolutionSummary] = useState(inspection.resolutionSummary ?? '');
  const [reworkFeedback, setReworkFeedback] = useState('');
  const [showReworkModal, setShowReworkModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupervisorOrAdmin = user?.role === 'SUPERVISOR' || user?.role === 'ADMIN';
  if (!isSupervisorOrAdmin) return null;

  const stage = inspection.workflowStage ?? (
    inspection.status === 'COMPLETED' ? 'RESOLVED' :
    inspection.status === 'IN_PROGRESS' ? 'FIELD_WORK' : 'RAISED'
  );

  // ── Action: Supervisor Coordinates & Dispatches to Field ────────────────
  async function handleDispatchToField(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const updated: Inspection = {
        ...inspection,
        workflowStage: 'FIELD_WORK',
        status: 'IN_PROGRESS',
        supervisorId: user.id,
        supervisorName: user.fullName,
        supervisorNotes: coordinationNotes.trim() || undefined,
        supervisedAt: now,
        localVersion: inspection.localVersion + 1,
        updatedAt: now,
      };

      await db.inspections.put(updated);

      if (coordinationNotes.trim()) {
        await db.notes.put({
          id: crypto.randomUUID(),
          inspectionId: inspection.id,
          authorId: user.id,
          authorName: user.fullName,
          content: `[SUPERVISOR COORDINATION DIRECTIVE]:\n${coordinationNotes.trim()}`,
          syncStatus: 'PENDING',
          createdAt: now,
          updatedAt: now,
        });
      }

      await createAuditEvent({
        userId: user.id,
        userName: user.fullName,
        entityType: 'INSPECTION',
        entityId: inspection.id,
        inspectionId: inspection.id,
        action: 'UPDATED',
        field: 'workflowStage',
        beforeValue: stage,
        afterValue: 'FIELD_WORK',
        metadata: {
          note: `Supervisor ${user.fullName} coordinated and dispatched to field technicians.`,
        },
      });

      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch inspection.');
    } finally {
      setLoading(false);
    }
  }

  // ── Action: Supervisor Verifies & Signs Off ─────────────────────────────
  async function handleVerifyAndSignOff(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const updated: Inspection = {
        ...inspection,
        workflowStage: 'RESOLVED',
        status: 'COMPLETED',
        verifiedBy: user.id,
        verifiedByName: user.fullName,
        verifiedAt: now,
        resolutionSummary: resolutionSummary.trim() || 'Work completed, verified and tested in compliance with engineering standards.',
        localVersion: inspection.localVersion + 1,
        updatedAt: now,
      };

      await db.inspections.put(updated);

      await db.notes.put({
        id: crypto.randomUUID(),
        inspectionId: inspection.id,
        authorId: user.id,
        authorName: user.fullName,
        content: `[SUPERVISOR VERIFICATION & SIGN-OFF]:\nVerified by Supervisor ${user.fullName} on ${new Date(now).toLocaleString()}.\nResolution: ${updated.resolutionSummary}`,
        syncStatus: 'PENDING',
        createdAt: now,
        updatedAt: now,
      });

      await createAuditEvent({
        userId: user.id,
        userName: user.fullName,
        entityType: 'INSPECTION',
        entityId: inspection.id,
        inspectionId: inspection.id,
        action: 'INSPECTION_COMPLETED',
        field: 'status',
        beforeValue: inspection.status,
        afterValue: 'COMPLETED',
        metadata: {
          verifiedBy: user.fullName,
          verifiedAt: now,
          resolution: updated.resolutionSummary,
        },
      });

      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign off inspection.');
    } finally {
      setLoading(false);
    }
  }

  // ── Action: Supervisor Requests Rework ──────────────────────────────────
  async function handleRequestRework() {
    if (!user || !reworkFeedback.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const updated: Inspection = {
        ...inspection,
        workflowStage: 'REWORK_REQUESTED',
        status: 'IN_PROGRESS',
        localVersion: inspection.localVersion + 1,
        updatedAt: now,
      };

      await db.inspections.put(updated);

      await db.notes.put({
        id: crypto.randomUUID(),
        inspectionId: inspection.id,
        authorId: user.id,
        authorName: user.fullName,
        content: `[SUPERVISOR REWORK REQUIRED]:\n${reworkFeedback.trim()}`,
        syncStatus: 'PENDING',
        createdAt: now,
        updatedAt: now,
      });

      await createAuditEvent({
        userId: user.id,
        userName: user.fullName,
        entityType: 'INSPECTION',
        entityId: inspection.id,
        inspectionId: inspection.id,
        action: 'UPDATED',
        field: 'workflowStage',
        beforeValue: 'AWAITING_VERIFICATION',
        afterValue: 'REWORK_REQUESTED',
        metadata: {
          feedback: reworkFeedback,
        },
      });

      setShowReworkModal(false);
      setReworkFeedback('');
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request rework.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle size={15} />
          {error}
        </div>
      )}

      {/* STAGE 2: COORDINATION & DISPATCH */}
      {(stage === 'ASSIGNED' || stage === 'RAISED') && (
        <div className="bg-gradient-to-br from-purple-50/80 via-white to-indigo-50/40 border border-purple-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <ClipboardCheck size={16} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-zinc-900">
                  Supervisor Review &amp; Field Coordination
                </h4>
                <p className="text-[11px] text-zinc-500 font-medium">
                  Review customer issue, add engineering guidelines or safety notices, then dispatch to assigned technicians.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 uppercase">
              Action Required
            </span>
          </div>

          <form onSubmit={handleDispatchToField} className="space-y-3">
            <div>
              <label className="text-xs font-bold text-zinc-700 block mb-1">
                Coordination Notes &amp; Safety Instructions for Technician
              </label>
              <textarea
                rows={2}
                value={coordinationNotes}
                onChange={e => setCoordinationNotes(e.target.value)}
                placeholder="e.g. Ensure lockout-tagout protocol on breaker 3 before opening inspection cover. Check lubricant viscosity and record decibel reading."
                className="w-full p-3 bg-white border border-purple-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 resize-none font-medium"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-zinc-500">
                Assigned Techs: <strong>{inspection.assignedTo.length} personnel</strong>
              </span>
              <button
                type="submit"
                disabled={loading}
                className="h-9 px-4 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm shadow-purple-200"
                id="btn-dispatch-to-field"
              >
                <Send size={13} />
                {loading ? 'Dispatching…' : 'Approve & Dispatch to Field'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STAGE 4: VERIFICATION & COMPLETION SIGN-OFF */}
      {(stage === 'AWAITING_VERIFICATION' || stage === 'FIELD_WORK') && (
        <div className="bg-gradient-to-br from-violet-50/80 via-white to-emerald-50/40 border border-violet-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <FileCheck size={16} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-zinc-900">
                  Supervisor Quality Verification &amp; Customer Sign-Off
                </h4>
                <p className="text-[11px] text-zinc-500 font-medium">
                  {stage === 'AWAITING_VERIFICATION'
                    ? 'Technician has completed field work. Review checklist answers, measurements, and photos below.'
                    : 'Technician is actively working. As Supervisor, you can verify findings anytime.'}
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${
              stage === 'AWAITING_VERIFICATION'
                ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
                : 'bg-zinc-100 text-zinc-600 border-zinc-200'
            }`}>
              {stage === 'AWAITING_VERIFICATION' ? 'Verification Awaited' : 'In Progress'}
            </span>
          </div>

          <form onSubmit={handleVerifyAndSignOff} className="space-y-3">
            <div>
              <label className="text-xs font-bold text-zinc-700 block mb-1">
                Resolution Summary &amp; Engineering Sign-Off (Customer Visible)
              </label>
              <textarea
                rows={2}
                value={resolutionSummary}
                onChange={e => setResolutionSummary(e.target.value)}
                placeholder="e.g. Defect investigated and rectified. Motor bearing replaced, operating temperature normalized at 48°C. Full safety test passed."
                className="w-full p-3 bg-white border border-violet-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 resize-none font-medium"
              />
            </div>

            <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowReworkModal(true)}
                className="h-9 px-3.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                id="btn-request-rework"
              >
                <RotateCcw size={13} />
                Request Rework / Fixes
              </button>

              <button
                type="submit"
                disabled={loading}
                className="h-9 px-5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm shadow-emerald-200 ml-auto"
                id="btn-verify-signoff"
              >
                <CheckCircle2 size={14} />
                {loading ? 'Signing off…' : 'Verify Completion & Resolve'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rework Modal */}
      {showReworkModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-2.5 text-rose-600">
              <RotateCcw size={18} />
              <h3 className="font-bold text-sm text-zinc-900">Request Field Rework</h3>
            </div>
            <p className="text-xs text-zinc-500">
              Specify what items need correction or further verification by the technician.
            </p>
            <textarea
              rows={3}
              value={reworkFeedback}
              onChange={e => setReworkFeedback(e.target.value)}
              placeholder="e.g. Please re-check the drive belt tension and upload a clear photo of the pressure gauge."
              className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 resize-none font-medium"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowReworkModal(false)}
                className="h-8 px-3 rounded-lg text-xs font-semibold text-zinc-500 hover:bg-zinc-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading || !reworkFeedback.trim()}
                onClick={handleRequestRework}
                className="h-8 px-4 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 cursor-pointer"
              >
                Submit Rework Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
