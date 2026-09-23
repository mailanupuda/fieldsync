import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../lib/db/database';
import { useSyncStore } from '../stores/syncStore';
import { useAuthStore } from '../stores/authStore';
import { useI18n } from '../lib/i18n/LanguageContext';
import { syncFromSupabase } from '../lib/sync/cloudSync';
import SyncStatusBadge from '../components/sync/SyncStatusBadge';
import OfflinePackageModal from '../components/offline/OfflinePackageModal';
import ReportComplaintModal from '../components/inspection/ReportComplaintModal';
import type { Inspection, AuditEvent, InspectionProgress, Asset } from '@/types/db';
import {
  ClipboardList,
  AlertTriangle,
  Upload,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  PlayCircle,
  Package,
  Mic,
  Clock,
  PlusCircle,
  ShieldCheck,
  Wrench,
  CheckCheck
} from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { pendingOperations, pendingMedia, status, isSyncing, syncNow } = useSyncStore();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  useEffect(() => {
    void syncFromSupabase();
  }, []);

  const role = user?.role ?? 'TECHNICIAN';
  const isCustomer = role === 'CUSTOMER';
  const isAdmin = role === 'ADMIN';
  const isSupervisor = role === 'SUPERVISOR';
  const isTechnician = role === 'TECHNICIAN';

  // Live queries from IndexedDB
  const inspections = useLiveQuery(() => db.inspections.toArray(), []);
  const assets = useLiveQuery(() => db.assets.toArray(), []);

  // Role-filtered inspections list
  const myInspections = inspections?.filter((i: Inspection) => {
    if (isAdmin) return true;
    if (isSupervisor) return true;
    if (isCustomer) {
      return (
        i.customerId === user?.id ||
        Boolean(user?.email && i.customerEmail && i.customerEmail.toLowerCase() === user.email.toLowerCase()) ||
        Boolean(user?.fullName && i.reportedBy && i.reportedBy.toLowerCase() === user.fullName.toLowerCase())
      );
    }
    // Technician: assigned to current user
    return i.assignedTo.includes(user?.id ?? '');
  });

  // Role-specific counts
  const newComplaintsCount = inspections?.filter(
    (i: Inspection) => i.status === 'NEW' || i.status === 'UNDER_REVIEW'
  ).length ?? 0;

  const awaitingVerificationCount = inspections?.filter(
    (i: Inspection) => i.status === 'PENDING_VERIFICATION'
  ).length ?? 0;

  const activeFieldWorkCount = inspections?.filter(
    (i: Inspection) => i.status === 'IN_PROGRESS' || i.status === 'ACCEPTED'
  ).length ?? 0;

  const customerResolvedCount = myInspections?.filter(
    (i: Inspection) => i.status === 'RESOLVED' || i.status === 'COMPLETED'
  ).length ?? 0;

  const customerActiveCount = myInspections?.filter(
    (i: Inspection) => i.status !== 'RESOLVED' && i.status !== 'COMPLETED' && i.status !== 'CANCELLED'
  ).length ?? 0;

  // Recent inspection progress (for Technician Resume card)
  const recentProgress = useLiveQuery(
    () => db.inspectionProgress.orderBy('lastOpenedAt').reverse().first(),
    []
  ) as InspectionProgress | undefined;

  const resumeInspection = useLiveQuery(
    () => (recentProgress?.inspectionId ? db.inspections.get(recentProgress.inspectionId) : undefined),
    [recentProgress?.inspectionId]
  ) as Inspection | undefined;

  const resumeAsset = useLiveQuery(
    () => (resumeInspection?.assetId ? db.assets.get(resumeInspection.assetId) : undefined),
    [resumeInspection?.assetId]
  ) as Asset | undefined;

  const pendingVoiceNotesCount = useLiveQuery(
    () => db.voiceNotes.where('uploadStatus').anyOf(['PENDING', 'PAUSED', 'FAILED', 'UPLOADING']).count(),
    []
  );

  const recentAuditEvents = useLiveQuery(
    () => db.auditEvents.orderBy('createdAt').reverse().limit(8).toArray(),
    []
  );

  // Directly fetch real audit events from database (no constant/synthetic fallback)
  const recentActivity: AuditEvent[] = recentAuditEvents ?? [];

  const pendingConflicts = useLiveQuery(
    () => db.conflicts.where('status').equals('OPEN').count(),
    []
  );

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* Header with Greeting & Role-specific primary action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider ${
                isCustomer
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : isAdmin
                  ? 'bg-orange-50 text-orange-700 border-orange-200'
                  : isSupervisor
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-sky-50 text-sky-700 border-sky-200'
              }`}
            >
              {role} Workspace
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight">
            Good {getGreeting()}, {user?.fullName?.split(' ')[0] ?? 'User'}
          </h1>
          <p className="text-zinc-500 text-xs sm:text-sm font-medium mt-1">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap self-start sm:self-auto">
          {/* Customer or Admin: Raise Issue / Report Complaint */}
          {(isCustomer || isAdmin) && (
            <button
              onClick={() => setReportModalOpen(true)}
              className="h-10 px-4 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-100"
              id="btn-customer-report-complaint"
            >
              <PlusCircle size={16} />
              <span>{isCustomer ? 'Report Complaint / Raise Issue' : 'Log Customer Issue'}</span>
            </button>
          )}

          {/* Supervisor: Quick jump to pending verifications */}
          {isSupervisor && awaitingVerificationCount > 0 && (
            <button
              onClick={() => navigate('/inspections')}
              className="h-10 px-4 rounded-xl font-bold text-xs bg-purple-600 hover:bg-purple-700 text-white active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-purple-100"
              id="btn-supervisor-review-queue"
            >
              <ShieldCheck size={16} />
              <span>Verify Work ({awaitingVerificationCount})</span>
            </button>
          )}

          {/* Technician / Field staff: Offline Package Prep */}
          {!isCustomer && (
            <button
              onClick={() => setOfflineModalOpen(true)}
              className="h-10 px-4 rounded-xl font-bold text-xs bg-zinc-900 hover:bg-black text-white active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-zinc-200"
              id="btn-prepare-offline"
            >
              <Package size={15} />
              <span>{t.prepareOffline}</span>
            </button>
          )}
        </div>
      </div>

      {/* Connectivity & Sync Control Banner */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <SyncStatusBadge />
        </div>
        <button
          onClick={() => void syncNow()}
          disabled={isSyncing || status === 'OFFLINE'}
          className="h-9 px-4 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs shadow-indigo-100 active:scale-95 disabled:opacity-40 transition-all flex items-center gap-1.5 cursor-pointer"
          aria-label="Sync now"
          id="btn-sync-now"
        >
          <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? t.syncing : t.syncNow}
        </button>
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* ROLE-SPECIFIC WORKFLOW ACTION BANNERS                      */}
      {/* ────────────────────────────────────────────────────────── */}

      {/* CUSTOMER ACTION BANNER */}
      {isCustomer && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300/60 rounded-3xl p-6 sm:p-7 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                  Customer Self-Service Portal
                </span>
              </div>
              <h2 className="text-xl font-black text-zinc-900 tracking-tight">
                Facing an infrastructure, network, or equipment issue?
              </h2>
              <p className="text-xs sm:text-sm text-zinc-600 max-w-2xl">
                Submit a service complaint with photos, description, and voice notes. FieldSync keeps your report
                safe offline and dispatches it directly to our administration team as soon as connectivity resumes.
              </p>
            </div>
            <button
              onClick={() => setReportModalOpen(true)}
              className="h-11 px-5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-amber-200 active:scale-95 transition-all shrink-0"
              id="btn-banner-report-issue"
            >
              <PlusCircle size={16} />
              <span>Report Service Issue</span>
            </button>
          </div>
        </div>
      )}

      {/* ADMIN ACTION BANNER: New Customer Issues Awaiting Assignment */}
      {isAdmin && newComplaintsCount > 0 && (
        <div className="bg-gradient-to-r from-orange-500/10 via-orange-500/5 to-transparent border border-orange-300/60 rounded-3xl p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-100 border border-orange-200 text-orange-600 flex items-center justify-center shrink-0">
                <ClipboardList size={20} />
              </div>
              <div>
                <p className="text-sm font-black text-orange-950">
                  {newComplaintsCount} Customer Complaint{newComplaintsCount > 1 ? 's' : ''} Awaiting Team Assignment
                </p>
                <p className="text-xs text-orange-800/80 mt-0.5">
                  Assign a coordinating Supervisor and field Technician to initiate the field-service workflow.
                </p>
              </div>
            </div>
            <Link
              to="/admin"
              className="h-10 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all shrink-0"
              id="btn-admin-triage-banner"
            >
              <span>Triage In Admin Panel</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {/* SUPERVISOR ACTION BANNER: Completed Field Work Awaiting Verification */}
      {isSupervisor && awaitingVerificationCount > 0 && (
        <div className="bg-gradient-to-r from-purple-500/10 via-purple-500/5 to-transparent border border-purple-300/60 rounded-3xl p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-100 border border-purple-200 text-purple-600 flex items-center justify-center shrink-0">
                <ShieldCheck size={20} />
              </div>
              <div>
                <p className="text-sm font-black text-purple-950">
                  {awaitingVerificationCount} Completed Work Order{awaitingVerificationCount > 1 ? 's' : ''} Ready for Verification
                </p>
                <p className="text-xs text-purple-800/80 mt-0.5">
                  Technicians have submitted checklist results & evidence. Review findings to approve resolution or request rework.
                </p>
              </div>
            </div>
            <Link
              to="/inspections"
              className="h-10 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all shrink-0"
              id="btn-supervisor-verify-banner"
            >
              <span>Review Submissions</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* TECHNICIAN RESUME INSPECTION CARD                         */}
      {/* ────────────────────────────────────────────────────────── */}
      {isTechnician && recentProgress && resumeInspection && (
        <div
          className="bg-zinc-950 bg-gradient-to-r from-zinc-950 via-zinc-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-7 shadow-xl border border-zinc-800 space-y-4"
          style={{ backgroundColor: '#09090b', color: '#ffffff' }}
          id="card-resume-inspection"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                In-Progress Field Work
              </span>
            </div>
            <span className="text-[11px] text-zinc-400 font-mono flex items-center gap-1">
              <Clock size={12} />
              {new Date(recentProgress.lastOpenedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {resumeAsset && (
                  <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                    {resumeAsset.assetCode}
                  </span>
                )}
                <span className="text-xs font-semibold text-zinc-400">{resumeInspection.siteName}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">{resumeInspection.title}</h2>
            </div>

            <div className="text-left sm:text-right shrink-0">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                {t.progress}
              </span>
              <span className="font-mono text-2xl font-black text-emerald-400">
                {recentProgress.completedCount} / {recentProgress.totalCount} completed
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden border border-zinc-700/60">
            <div
              className="bg-emerald-400 h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.round(
                  (recentProgress.completedCount / Math.max(1, recentProgress.totalCount)) * 100
                )}%`,
              }}
            />
          </div>

          {/* Last Completed & Next Incomplete Items */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
            {recentProgress.lastChecklistTitle && (
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                  Last Completed
                </span>
                <p className="font-semibold text-zinc-200 truncate flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                  {recentProgress.lastChecklistTitle}
                </p>
              </div>
            )}

            {recentProgress.nextChecklistTitle ? (
              <div className="bg-indigo-950/60 border border-indigo-500/30 rounded-xl p-3">
                <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block mb-1">
                  Next Checklist Item
                </span>
                <p className="font-semibold text-indigo-100 truncate flex items-center gap-1.5">
                  <ArrowRight size={14} className="text-indigo-400 shrink-0" />
                  {recentProgress.nextChecklistTitle}
                </p>
              </div>
            ) : (
              <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3">
                <p className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 size={14} />
                  Inspection Ready for Submission
                </p>
              </div>
            )}
          </div>

          {/* Resume Action Buttons */}
          <div className="pt-2 flex items-center gap-3 flex-wrap">
            <button
              onClick={() => {
                const targetUrl = recentProgress.nextChecklistItemId
                  ? `/inspections/${resumeInspection.id}?item=${recentProgress.nextChecklistItemId}&mode=quick`
                  : `/inspections/${resumeInspection.id}?mode=quick`;
                navigate(targetUrl);
              }}
              className="h-12 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-black text-sm tracking-wide flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
              id="btn-resume-inspection"
            >
              <PlayCircle size={18} />
              <span>{t.resumeInspection}</span>
            </button>

            <button
              onClick={() => navigate(`/inspections/${resumeInspection.id}`)}
              className="h-12 px-4 rounded-2xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-100 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer border border-zinc-700/80 transition-colors"
            >
              View Full Overview
            </button>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* REAL STATS GRID (Tailored per role, no fake counters)     */}
      {/* ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <Link
          to="/inspections"
          className="bg-white border border-zinc-200/80 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all group block"
          id="stat-card-1"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              {isCustomer ? 'My Complaints' : isAdmin ? 'New Issues' : isSupervisor ? 'Verification' : 'Assigned'}
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <ClipboardList size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-zinc-900 font-mono tracking-tight">
            {isCustomer
              ? myInspections?.length ?? 0
              : isAdmin
              ? newComplaintsCount
              : isSupervisor
              ? awaitingVerificationCount
              : myInspections?.length ?? 0}
          </div>
          <div className="text-xs font-semibold text-zinc-600 mt-1">
            {isCustomer
              ? 'Reported Issues'
              : isAdmin
              ? 'Awaiting Assignment'
              : isSupervisor
              ? 'Pending Sign-Off'
              : 'Assigned Work Orders'}
          </div>
        </Link>

        {/* Card 2 */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-amber-300 transition-all block">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              {isCustomer ? 'In Service' : isAdmin ? 'Active Field' : isSupervisor ? 'In Field' : 'Unsynced'}
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center">
              {isCustomer || isAdmin || isSupervisor ? <Wrench size={16} /> : <Upload size={16} />}
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-zinc-900">
            {isCustomer
              ? customerActiveCount
              : isAdmin || isSupervisor
              ? activeFieldWorkCount
              : pendingOperations}
          </div>
          <div className="text-xs font-semibold text-zinc-600 mt-1">
            {isCustomer
              ? 'Under Investigation'
              : isAdmin || isSupervisor
              ? 'Technicians Working'
              : 'Local Operations'}
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all block">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              {isCustomer ? 'Resolved' : isAdmin ? 'Total Issues' : isSupervisor ? 'Total Supervised' : 'Media Queue'}
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
              {isCustomer ? <CheckCheck size={16} /> : isTechnician ? <Mic size={16} /> : <ClipboardList size={16} />}
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-zinc-900">
            {isCustomer
              ? customerResolvedCount
              : isAdmin
              ? inspections?.length ?? 0
              : isSupervisor
              ? inspections?.length ?? 0
              : pendingMedia + (pendingVoiceNotesCount ?? 0)}
          </div>
          <div className="text-xs font-semibold text-zinc-600 mt-1">
            {isCustomer
              ? 'Completed Resolutions'
              : isAdmin
              ? 'System Total'
              : isSupervisor
              ? 'Total Work Orders'
              : `${pendingMedia} photos · ${pendingVoiceNotesCount ?? 0} voice`}
          </div>
        </div>

        {/* Card 4 */}
        <Link
          to={isCustomer ? '/inspections' : '/conflicts'}
          className="bg-white border border-zinc-200/80 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-rose-300 transition-all group block"
          id="stat-card-4"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              {isCustomer ? 'Unsynced' : t.conflicts}
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <AlertTriangle size={16} />
            </div>
          </div>
          <div
            className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${
              isCustomer
                ? pendingOperations > 0
                  ? 'text-amber-600'
                  : 'text-zinc-900'
                : (pendingConflicts ?? 0) > 0
                ? 'text-rose-600 font-bold'
                : 'text-zinc-900'
            }`}
          >
            {isCustomer ? pendingOperations : pendingConflicts ?? 0}
          </div>
          <div className="text-xs font-semibold text-zinc-600 mt-1">
            {isCustomer ? 'Local Queue' : 'Require Review'}
          </div>
        </Link>
      </div>

      {/* ── SUPERVISOR / ADMIN: Pending Conflicts Action Card ──────── */}
      {(isSupervisor || isAdmin) && (pendingConflicts ?? 0) > 0 && (
        <Link
          to="/conflicts"
          className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all block group"
          id="card-supervisor-conflicts"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <p className="text-sm font-black text-amber-900">
                  {pendingConflicts} Open Conflict{(pendingConflicts ?? 0) > 1 ? 's' : ''} Require{(pendingConflicts ?? 0) === 1 ? 's' : ''} Resolution
                </p>
                <p className="text-xs font-medium text-amber-700 mt-0.5">
                  {isSupervisor
                    ? 'Your authority is needed to adjudicate these conflicting technician findings.'
                    : 'System data conflicts pending admin or supervisor resolution.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-700 group-hover:underline hidden sm:inline">Resolve Now</span>
              <ArrowRight size={16} className="text-amber-600 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </Link>
      )}

      {/* Main Content: Relevant Work Orders + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-zinc-900 tracking-tight">
              {isCustomer
                ? 'My Service Issues'
                : isAdmin
                ? 'Recent Incoming Issues'
                : isSupervisor
                ? 'Supervised Work Orders'
                : 'Active Inspections'}
            </h2>
            <Link
              to="/inspections"
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline"
            >
              View all <ArrowRight size={12} />
            </Link>
          </div>

          <div className="space-y-3">
            {!myInspections || myInspections.length === 0 ? (
              <div className="bg-white border border-zinc-200/80 rounded-2xl p-8 text-center shadow-sm">
                <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-xs">
                  <CheckCircle2 size={24} />
                </div>
                <p className="text-sm font-bold text-zinc-900">
                  {isCustomer ? 'No service issues filed' : 'All caught up!'}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {isCustomer
                    ? 'Use the button above to report an issue if you experience any equipment or facility trouble.'
                    : 'No pending inspections assigned to you.'}
                </p>
              </div>
            ) : (
              myInspections.slice(0, 4).map((inspection: Inspection) => {
                const inspAsset = assets?.find((a: Asset) => a.id === inspection.assetId);
                return (
                  <Link
                    key={inspection.id}
                    to={`/inspections/${inspection.id}`}
                    className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all block group"
                    id={`inspection-card-${inspection.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {inspAsset && (
                            <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 border border-indigo-200/60 px-1.5 py-0.5 rounded">
                              {inspAsset.assetCode}
                            </span>
                          )}
                          <p className="font-bold text-zinc-900 text-sm group-hover:text-indigo-600 transition-colors truncate">
                            {inspection.title}
                          </p>
                        </div>
                        <p className="text-xs font-medium text-zinc-500 mt-0.5">{inspection.siteName}</p>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${getPriorityBadge(
                          inspection.priority
                        )}`}
                      >
                        {inspection.priority}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-100 flex-wrap">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${getStatusBadge(
                          inspection.status
                        )}`}
                      >
                        {inspection.status.replace('_', ' ')}
                      </span>

                      {inspection.category && (
                        <span className="text-[10px] font-medium text-zinc-500 bg-zinc-50 border border-zinc-200/60 px-2 py-0.5 rounded-full">
                          {inspection.category.replace('_', ' ')}
                        </span>
                      )}

                      {inspection.localVersion > inspection.serverVersion && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          Unsynced
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-zinc-900 tracking-tight">Recent Activity</h2>
          </div>

          <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-sm">
            {!recentActivity || recentActivity.length === 0 ? (
              <div className="py-8 text-center text-xs font-medium text-zinc-400">
                No recent activity logged yet.
              </div>
            ) : (
              <div className="space-y-3.5">
                {recentActivity.map((event, idx: number) => {
                  const isSuccess = event.action === 'INSPECTION_COMPLETED';
                  const isProgress = event.action === 'UPDATED';
                  const isSync = event.action === 'SYNCED';

                  return (
                    <div key={event.id} className="flex gap-3 items-start group">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full shrink-0 mt-1 ring-4 ${
                          isSuccess
                            ? 'bg-emerald-500 ring-emerald-50'
                            : isProgress
                            ? 'bg-sky-500 ring-sky-50'
                            : isSync
                            ? 'bg-purple-500 ring-purple-50'
                            : 'bg-indigo-500 ring-indigo-50'
                        }`} />
                        {idx < recentActivity.length - 1 && (
                          <div className="w-px flex-1 bg-zinc-200 my-1 min-h-[22px]" />
                        )}
                      </div>
                      <div className="min-w-0 pb-1 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-zinc-900 leading-tight">
                            {formatAuditAction(event.action)}
                          </p>
                          <span className="text-[10px] font-semibold text-zinc-400 shrink-0">
                            {formatTimeShort(event.createdAt)}
                          </span>
                        </div>
                        <p className="text-[11px] font-medium text-zinc-600 mt-0.5 line-clamp-1">
                          {event.afterValue || event.entityType}
                        </p>
                        <p className="text-[10px] font-semibold text-zinc-400 mt-0.5 flex items-center gap-1.5">
                          <span className="text-zinc-700 font-bold">{event.userName || 'System'}</span>
                          <span>·</span>
                          <span className="uppercase text-[9px] tracking-wider font-mono px-1 py-0.2 bg-zinc-100 rounded text-zinc-500">
                            {event.entityType}
                          </span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Report Complaint Modal (Customer / Admin) */}
      <ReportComplaintModal isOpen={reportModalOpen} onClose={() => setReportModalOpen(false)} />

      {/* Offline Package Modal */}
      <OfflinePackageModal isOpen={offlineModalOpen} onClose={() => setOfflineModalOpen(false)} />
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function getStatusBadge(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'IN_PROGRESS':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'CANCELLED':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-zinc-100 text-zinc-700 border-zinc-200';
  }
}

function getPriorityBadge(priority: string): string {
  switch (priority) {
    case 'CRITICAL':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'HIGH':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'MEDIUM':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    default:
      return 'bg-zinc-100 text-zinc-700 border-zinc-200';
  }
}

function formatAuditAction(action: string): string {
  const map: Record<string, string> = {
    CREATED: 'Issue Logged',
    UPDATED: 'Work Order Updated',
    INSPECTION_COMPLETED: 'Inspection Verified & Closed',
    CONFLICT_DETECTED: 'Conflict Detected',
    CONFLICT_RESOLVED: 'Conflict Resolved',
    NOTE_ADDED: 'Field Observation Added',
    PHOTO_ADDED: 'Photo Attached',
    PHOTO_UPLOADED: 'Media Uploaded to Cloudinary',
    SYNCED: 'Cloud Synchronized with Supabase',
  };
  return map[action] ?? action.replace(/_/g, ' ');
}

function formatTimeShort(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const diffMins = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
