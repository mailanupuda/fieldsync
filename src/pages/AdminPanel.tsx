import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/database';
import { seedLocalDatabase } from '@/lib/db/seed';
import { useAuthStore } from '@/stores/authStore';
import type { UserRecord, Inspection, Asset, UserRole, InspectionStatus, InspectionPriority, AssetType } from '@/types/db';
import {
  Database,
  Download,
  RefreshCw,
  CheckCircle,
  Shield,
  Users,
  ClipboardList,
  HardDrive,
  Plus,
  X,
  ChevronDown,
  Wrench,
  AlertTriangle,
  Trash2,
  UserCheck,
  Receipt,
} from 'lucide-react';
import AdminInvoicesTab from '@/components/admin/AdminInvoicesTab';

// ── Types for forms ──────────────────────────────────────────────────────────
type AdminTab = 'users' | 'inspections' | 'assets' | 'invoices' | 'system';

const ROLE_COLORS: Record<UserRole, string> = {
  CUSTOMER: 'bg-amber-50 text-amber-800 border-amber-200',
  TECHNICIAN: 'bg-sky-50 text-sky-700 border-sky-200',
  SUPERVISOR: 'bg-purple-50 text-purple-700 border-purple-200',
  ADMIN: 'bg-orange-50 text-orange-700 border-orange-200',
};

export default function AdminPanel() {
  const { user: currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight flex items-center gap-2.5">
            <Shield className="text-orange-500" />
            System Administration
          </h1>
          <p className="text-zinc-500 text-xs sm:text-sm font-medium mt-1">
            Manage users, inspections, assets, and system configuration. Only visible to Admins.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200 self-start">
          <Shield size={12} /> ADMIN ACCESS
        </span>
      </div>

      {/* Toast Message */}
      {message && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-2 text-xs font-bold ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <CheckCircle size={16} />
          {message.text}
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex bg-white border border-zinc-200 rounded-xl p-1 gap-1 shadow-2xs overflow-x-auto">
        {([
          { key: 'users', label: 'Users', icon: Users },
          { key: 'inspections', label: 'Inspections', icon: ClipboardList },
          { key: 'assets', label: 'Assets', icon: Wrench },
          { key: 'invoices', label: 'Invoices & Billing', icon: Receipt },
          { key: 'system', label: 'System', icon: HardDrive },
        ] as { key: AdminTab; label: string; icon: React.FC<{ size: number; className?: string }> }[]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === key
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
            }`}
            id={`admin-tab-${key}`}
          >
            <Icon size={14} className="shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'users' && (
        <UsersTab showMessage={showMessage} currentUserId={currentUser?.id} />
      )}
      {activeTab === 'inspections' && (
        <InspectionsTab showMessage={showMessage} />
      )}
      {activeTab === 'assets' && (
        <AssetsTab showMessage={showMessage} />
      )}
      {activeTab === 'invoices' && (
        <AdminInvoicesTab showMessage={showMessage} />
      )}
      {activeTab === 'system' && (
        <SystemTab showMessage={showMessage} />
      )}
    </div>
  );
}

// ── Tab: Users ──────────────────────────────────────────────────────────────

function UsersTab({
  showMessage,
  currentUserId,
}: {
  showMessage: (type: 'success' | 'error', text: string) => void;
  currentUserId?: string;
}) {
  const rawUsers = useLiveQuery(() => db.users.toArray(), []) ?? [];
  // Cleanly deduplicate users by email:
  const users = Array.from(
    rawUsers.reduce((map, u) => {
      const key = u.email.toLowerCase().trim();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, u);
      } else {
        if (u.id === currentUserId) {
          map.set(key, u);
        } else if (existing.id !== currentUserId && !u.fullName.includes('(') && existing.fullName?.includes('(')) {
          map.set(key, u);
        }
      }
      return map;
    }, new Map<string, UserRecord>()).values()
  );
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', role: 'TECHNICIAN' as UserRole });
  const [saving, setSaving] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);

  async function handleCreate() {
    if (!form.fullName.trim() || !form.email.trim()) return;
    setSaving(true);
    try {
      const newUser: UserRecord = {
        id: crypto.randomUUID(),
        email: form.email.trim(),
        fullName: form.fullName.trim(),
        role: form.role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.users.put(newUser);
      showMessage('success', `User "${newUser.fullName}" created locally. Invite them to sign up with this email.`);
      setForm({ fullName: '', email: '', role: 'TECHNICIAN' });
      setShowCreate(false);
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: UserRole) {
    try {
      await db.users.update(userId, { role: newRole, updatedAt: new Date().toISOString() });
      if (currentUserId === userId) {
        await useAuthStore.getState().switchRole(newRole);
      }
      showMessage('success', 'Role updated successfully.');
      setEditingRole(null);
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to update role.');
    }
  }

  async function handleDeleteUser(userId: string) {
    if (userId === currentUserId) {
      showMessage('error', 'You cannot delete your own active account.');
      return;
    }
    try {
      await db.users.delete(userId);
      showMessage('success', 'User record removed.');
    } catch (err) {
      console.error('Failed to delete user:', err);
      showMessage('error', 'Failed to delete user.');
    }
  }

  const roleCounts: Record<UserRole, number> = {
    CUSTOMER: users.filter(u => u.role === 'CUSTOMER').length,
    TECHNICIAN: users.filter(u => u.role === 'TECHNICIAN').length,
    SUPERVISOR: users.filter(u => u.role === 'SUPERVISOR').length,
    ADMIN: users.filter(u => u.role === 'ADMIN').length,
  };

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['CUSTOMER', 'TECHNICIAN', 'SUPERVISOR', 'ADMIN'] as UserRole[]).map(role => (
          <div key={role} className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm text-center">
            <div className={`text-2xl font-black font-mono ${
              role === 'CUSTOMER' ? 'text-amber-600' : role === 'ADMIN' ? 'text-orange-600' : role === 'SUPERVISOR' ? 'text-purple-600' : 'text-sky-600'
            }`}>{roleCounts[role]}</div>
            <div className={`text-[10px] font-bold uppercase tracking-wider mt-1 px-2 py-0.5 rounded-full border inline-block ${ROLE_COLORS[role]}`}>{role}</div>
          </div>
        ))}
      </div>

      {/* Create user form */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-100">
          <h2 className="text-sm font-bold text-zinc-900">Team Members ({users.length})</h2>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="h-8 px-3 rounded-xl font-bold text-xs bg-zinc-900 text-white hover:bg-zinc-700 flex items-center gap-1.5 cursor-pointer transition-all"
            id="btn-admin-create-user"
          >
            {showCreate ? <X size={13} /> : <Plus size={13} />}
            {showCreate ? 'Cancel' : 'Add User'}
          </button>
        </div>

        {showCreate && (
          <div className="p-4 border-b border-zinc-100 bg-zinc-50/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Full Name</label>
                <input
                  type="text"
                  className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-400 transition-all"
                  placeholder="Jane Smith"
                  value={form.fullName}
                  onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                  id="admin-user-name"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Email Address</label>
                <input
                  type="email"
                  className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-400 transition-all"
                  placeholder="jane@company.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  id="admin-user-email"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Role</label>
              <div className="relative">
                <select
                  className="w-full h-9 px-3 pr-8 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-900 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-400"
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
                  id="admin-user-role"
                >
                  <option value="TECHNICIAN">TECHNICIAN — Field Inspector</option>
                  <option value="SUPERVISOR">SUPERVISOR — Review & Conflicts</option>
                  <option value="ADMIN">ADMIN — System Administrator</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => void handleCreate()}
                disabled={saving || !form.fullName.trim() || !form.email.trim()}
                className="h-9 px-4 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-all flex items-center gap-1.5 cursor-pointer"
                id="btn-admin-save-user"
              >
                {saving ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
                {saving ? 'Saving…' : 'Create User Record'}
              </button>
            </div>
            <p className="text-[10px] font-medium text-zinc-400">
              ⚡ Creates a local user record. The user will need to sign up via the app login page with the matching email to link their account.
            </p>
          </div>
        )}

        {/* Users list */}
        <div className="divide-y divide-zinc-100">
          {users.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-400 font-medium">
              No users found. Add users or seed the database.
            </div>
          ) : (
            users.map(u => (
              <div key={u.id} className="flex items-center justify-between p-4 hover:bg-zinc-50/50 transition-colors" id={`user-row-${u.id}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold border ${
                    u.role === 'ADMIN' ? 'bg-orange-100 border-orange-200 text-orange-700' :
                    u.role === 'SUPERVISOR' ? 'bg-purple-100 border-purple-200 text-purple-700' :
                    'bg-sky-100 border-sky-200 text-sky-700'
                  }`}>
                    {u.fullName?.charAt(0)?.toUpperCase() ?? 'U'}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900">
                      {u.fullName}
                      {u.id === currentUserId && (
                        <span className="ml-2 text-[10px] font-bold text-zinc-400 border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 rounded-full">you</span>
                      )}
                    </p>
                    <p className="text-[11px] font-medium text-zinc-500">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {editingRole === u.id ? (
                    <div className="relative">
                      <select
                        className="h-7 pl-2 pr-7 text-xs font-bold border border-zinc-300 rounded-lg cursor-pointer appearance-none bg-white focus:outline-none"
                        defaultValue={u.role}
                        onChange={e => void handleRoleChange(u.id, e.target.value as UserRole)}
                        autoFocus
                        onBlur={() => setEditingRole(null)}
                        id={`role-select-${u.id}`}
                      >
                        <option value="TECHNICIAN">TECHNICIAN</option>
                        <option value="SUPERVISOR">SUPERVISOR</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingRole(u.id)}
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${ROLE_COLORS[u.role]}`}
                      id={`btn-change-role-${u.id}`}
                    >
                      {u.role}
                    </button>
                  )}
                  {u.id !== currentUserId && (
                    <button
                      onClick={() => void handleDeleteUser(u.id)}
                      className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Remove User"
                      id={`btn-delete-user-${u.id}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Inspections ─────────────────────────────────────────────────────────

function InspectionsTab({
  showMessage,
}: {
  showMessage: (type: 'success' | 'error', text: string) => void;
}) {
  const inspections = useLiveQuery(async () => {
    const all = await db.inspections.toArray();
    return all.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, []) ?? [];
  const assets = useLiveQuery(() => db.assets.toArray(), []) ?? [];
  const rawUsers = useLiveQuery(() => db.users.toArray(), []) ?? [];
  const users = Array.from(
    rawUsers.reduce((map, u) => {
      const key = u.email.toLowerCase().trim();
      if (!map.has(key)) map.set(key, u);
      return map;
    }, new Map<string, UserRecord>()).values()
  );
  const supervisors = users.filter(u => u.role === 'SUPERVISOR' || u.role === 'ADMIN');
  const fieldTechnicians = users.filter(u => u.role === 'TECHNICIAN' || u.role === 'SUPERVISOR');

  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingAssigneesId, setEditingAssigneesId] = useState<string | null>(null);
  const [triageInspection, setTriageInspection] = useState<Inspection | null>(null);
  const [triageSupervisorId, setTriageSupervisorId] = useState('');
  const [triageTechnicianIds, setTriageTechnicianIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: '',
    siteName: '',
    assetId: '',
    priority: 'MEDIUM' as InspectionPriority,
    scheduledDate: '',
    supervisorId: '',
    assignedTo: [] as string[],
  });

  async function handleCreate() {
    if (!form.title.trim() || !form.siteName.trim()) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const inspectionId = crypto.randomUUID();
      const finalSupervisorId = form.supervisorId || supervisors[0]?.id;
      const selectedSupervisor = users.find(u => u.id === finalSupervisorId);
      // If no technician was specifically selected, assign to available technicians
      const finalAssignedTo = form.assignedTo.length > 0 ? form.assignedTo : fieldTechnicians.map(t => t.id);

      const newInspection: Inspection = {
        id: inspectionId,
        title: form.title.trim(),
        siteName: form.siteName.trim(),
        assetId: form.assetId || '',
        status: 'PENDING' as InspectionStatus,
        priority: form.priority,
        workflowStage: 'ASSIGNED',
        supervisorId: finalSupervisorId,
        supervisorName: selectedSupervisor?.fullName,
        assignedTo: finalAssignedTo,
        assignedAt: now,
        scheduledDate: form.scheduledDate || undefined,
        localVersion: 1,
        serverVersion: 0,
        syncStatus: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };
      await db.inspections.put(newInspection);

      // Create standard checklist items for technicians to complete
      const defaultItems = [
        { question: 'Visual condition of housing & mountings', type: 'GOOD_DAMAGED' as const, required: true, order: 1 },
        { question: 'Safety guards & emergency stop verified', type: 'PASS_FAIL' as const, required: true, order: 2 },
        { question: 'Operating temperature (°C)', type: 'NUMERIC' as const, required: true, unit: '°C', minValue: 0, maxValue: 120, order: 3 },
        { question: 'Vibration & acoustic levels within normal limits', type: 'PASS_FAIL' as const, required: true, order: 4 },
        { question: 'Lubrication / oil levels checked', type: 'PASS_FAIL' as const, required: true, order: 5 },
        { question: 'Electrical connections secure & grounded', type: 'PASS_FAIL' as const, required: true, order: 6 },
        { question: 'Inspector field observations & notes', type: 'TEXT' as const, required: false, order: 7 },
      ];
      for (const item of defaultItems) {
        await db.checklistItems.put({
          ...item,
          id: crypto.randomUUID(),
          inspectionId,
          createdAt: now,
        });
      }

      showMessage('success', `Inspection "${newInspection.title}" created with Supervisor (${selectedSupervisor?.fullName}) and assigned to ${finalAssignedTo.length} technician(s).`);
      setForm({ title: '', siteName: '', assetId: '', priority: 'MEDIUM', scheduledDate: '', supervisorId: '', assignedTo: [] });
      setShowCreate(false);
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to create inspection.');
    } finally {
      setSaving(false);
    }
  }

  function handleOpenTriage(insp: Inspection) {
    setTriageInspection(insp);
    setTriageSupervisorId(insp.supervisorId || supervisors[0]?.id || '');
    setTriageTechnicianIds(insp.assignedTo?.length > 0 ? insp.assignedTo : fieldTechnicians.map(t => t.id));
  }

  async function handleConfirmAssignTeam() {
    if (!triageInspection || !triageSupervisorId) return;
    try {
      const selectedSupervisor = users.find(u => u.id === triageSupervisorId);
      const now = new Date().toISOString();
      await db.inspections.update(triageInspection.id, {
        supervisorId: triageSupervisorId,
        supervisorName: selectedSupervisor?.fullName ?? 'Supervisor',
        assignedTo: triageTechnicianIds.length > 0 ? triageTechnicianIds : fieldTechnicians.map(t => t.id),
        workflowStage: 'ASSIGNED',
        status: 'PENDING',
        updatedAt: now,
        syncStatus: 'PENDING',
      });
      showMessage('success', `Assigned Supervisor (${selectedSupervisor?.fullName}) and ${triageTechnicianIds.length} Technician(s).`);
      setTriageInspection(null);
    } catch (err) {
      console.error('Failed to assign team:', err);
      showMessage('error', 'Failed to assign team.');
    }
  }

  async function handleStatusChange(id: string, status: string) {
    try {
      await db.inspections.update(id, { status: status as Inspection['status'], updatedAt: new Date().toISOString(), syncStatus: 'PENDING' });
      showMessage('success', 'Inspection status updated.');
    } catch (err) {
      console.error('Failed to update status:', err);
      showMessage('error', 'Failed to update status.');
    }
  }

  async function handleDeleteInspection(id: string) {
    try {
      await db.inspections.delete(id);
      await db.checklistItems.where('inspectionId').equals(id).delete();
      showMessage('success', 'Inspection and checklist items deleted.');
    } catch (err) {
      console.error('Failed to delete inspection:', err);
      showMessage('error', 'Failed to delete inspection.');
    }
  }

  async function handleToggleAssigneeOnInspection(inspectionId: string, currentAssignees: string[], userId: string) {
    const nextAssignees = currentAssignees.includes(userId)
      ? currentAssignees.filter(id => id !== userId)
      : [...currentAssignees, userId];
    try {
      await db.inspections.update(inspectionId, {
        assignedTo: nextAssignees,
        updatedAt: new Date().toISOString(),
        syncStatus: 'PENDING',
      });
      showMessage('success', 'Assigned technicians updated.');
    } catch (err) {
      console.error('Failed to update assignees:', err);
      showMessage('error', 'Failed to update assignees.');
    }
  }

  function toggleAssignee(userId: string) {
    setForm(f => ({
      ...f,
      assignedTo: f.assignedTo.includes(userId)
        ? f.assignedTo.filter(id => id !== userId)
        : [...f.assignedTo, userId],
    }));
  }

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'COMPLETED': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'IN_PROGRESS': return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'CANCELLED': return 'bg-zinc-50 text-zinc-500 border-zinc-200';
      case 'CONFLICT': return 'bg-rose-50 text-rose-700 border-rose-200';
      default: return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-100">
          <h2 className="text-sm font-bold text-zinc-900">All Inspections ({inspections.length})</h2>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="h-8 px-3 rounded-xl font-bold text-xs bg-zinc-900 text-white hover:bg-zinc-700 flex items-center gap-1.5 cursor-pointer transition-all"
            id="btn-admin-create-inspection"
          >
            {showCreate ? <X size={13} /> : <Plus size={13} />}
            {showCreate ? 'Cancel' : 'Create Inspection'}
          </button>
        </div>

        {showCreate && (
          <div className="p-4 border-b border-zinc-100 bg-zinc-50/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Inspection Title</label>
                <input
                  type="text"
                  className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-400"
                  placeholder="Annual Motor Inspection"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  id="admin-inspection-title"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Site Name</label>
                <input
                  type="text"
                  className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-400"
                  placeholder="Factory A"
                  value={form.siteName}
                  onChange={e => setForm(f => ({ ...f, siteName: e.target.value }))}
                  id="admin-inspection-site"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Asset</label>
                <div className="relative">
                  <select
                    className="w-full h-9 px-3 pr-8 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-900 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-400"
                    value={form.assetId}
                    onChange={e => setForm(f => ({ ...f, assetId: e.target.value }))}
                    id="admin-inspection-asset"
                  >
                    <option value="">— No specific asset —</option>
                    {assets.map((a: Asset) => (
                      <option key={a.id} value={a.id}>{a.assetCode} — {a.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Priority</label>
                <div className="relative">
                  <select
                    className="w-full h-9 px-3 pr-8 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-900 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-400"
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value as InspectionPriority }))}
                    id="admin-inspection-priority"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Scheduled Date</label>
                <input
                  type="date"
                  className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-400"
                  value={form.scheduledDate}
                  onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))}
                  id="admin-inspection-date"
                />
              </div>
            </div>

            {/* Assign Coordinating Supervisor */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                Assign Coordinating Supervisor <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <select
                  className="w-full h-9 px-3 pr-8 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-900 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-400 font-medium"
                  value={form.supervisorId}
                  onChange={e => setForm(f => ({ ...f, supervisorId: e.target.value }))}
                  id="admin-assign-supervisor"
                >
                  <option value="">— Select Supervisor —</option>
                  {supervisors.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.email}) — SUPERVISOR
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>

            {/* Assign Technicians */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-2">Assign Field Technicians</label>
              <div className="flex flex-wrap gap-2">
                {fieldTechnicians.length === 0 ? (
                  <p className="text-[11px] text-zinc-400">No technicians or supervisors available. Add users in Users tab.</p>
                ) : fieldTechnicians.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleAssignee(u.id)}
                    className={`text-xs font-bold px-2.5 py-1 rounded-full border cursor-pointer transition-all ${
                      form.assignedTo.includes(u.id)
                        ? 'bg-indigo-600 text-white border-indigo-700'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                    id={`assign-tech-${u.id}`}
                  >
                    {form.assignedTo.includes(u.id) ? '✓ ' : '+ '}
                    {u.fullName} ({u.role})
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => void handleCreate()}
                disabled={saving || !form.title.trim() || !form.siteName.trim()}
                className="h-9 px-4 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-all flex items-center gap-1.5 cursor-pointer"
                id="btn-admin-save-inspection"
              >
                {saving ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
                {saving ? 'Creating…' : 'Create & Assign Inspection'}
              </button>
            </div>
          </div>
        )}

        {/* Incoming Customer Complaints / Triage Queue */}
        {(() => {
          const incomingComplaints = inspections.filter(i => i.workflowStage === 'RAISED' || !i.supervisorId || i.assignedTo.length === 0);
          if (incomingComplaints.length === 0) return null;
          return (
            <div className="p-4 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent border-b border-amber-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                  <h3 className="text-xs font-black text-amber-950 uppercase tracking-wider">
                    Customer Complaints Awaiting Team Assignment ({incomingComplaints.length})
                  </h3>
                </div>
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                  Admin Action Required
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                {incomingComplaints.map(complaint => (
                  <div key={complaint.id} className="p-3 bg-white rounded-xl border border-amber-200/80 shadow-2xs flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                        {complaint.priority}
                      </span>
                      <h4 className="text-xs font-bold text-zinc-900 truncate mt-1">{complaint.title}</h4>
                      <p className="text-[11px] text-zinc-500 truncate">
                        Customer: <strong>{complaint.reportedBy || 'Customer'}</strong> · {complaint.siteName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenTriage(complaint)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shrink-0 shadow-xs cursor-pointer"
                    >
                      Assign Team
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <div className="divide-y divide-zinc-100">
          {inspections.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-400 font-medium">No inspections yet. Create one above or initialize sample data in System tab.</div>
          ) : (
            inspections.map((inspection: Inspection) => {
              const asset = assets.find((a: Asset) => a.id === inspection.assetId);
              const isEditingAssignees = editingAssigneesId === inspection.id;
              const assignedTechs = users.filter(u => inspection.assignedTo.includes(u.id));
              const assignedSupervisor = users.find(u => u.id === inspection.supervisorId);

              return (
                <div key={inspection.id} className="p-4 hover:bg-zinc-50/50 transition-colors space-y-2.5" id={`admin-inspection-${inspection.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {asset && (
                          <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 border border-indigo-200/60 px-1.5 py-0.5 rounded">
                            {asset.assetCode}
                          </span>
                        )}
                        <span className="text-sm font-bold text-zinc-900 truncate">{inspection.title}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                          inspection.priority === 'CRITICAL' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                          inspection.priority === 'HIGH' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                          'bg-zinc-50 text-zinc-600 border-zinc-200'
                        }`}>
                          {inspection.priority}
                        </span>
                        {inspection.workflowStage && (
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                            {inspection.workflowStage}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-medium text-zinc-500 mt-0.5">
                        {inspection.siteName}
                        {inspection.scheduledDate && ` · Scheduled: ${inspection.scheduledDate}`}
                        {inspection.reportedBy && ` · Customer: ${inspection.reportedBy}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="relative">
                        <select
                          className={`h-7 pl-2 pr-7 text-[10px] font-bold border rounded-full cursor-pointer appearance-none focus:outline-none ${getStatusColor(inspection.status)}`}
                          value={inspection.status}
                          onChange={e => void handleStatusChange(inspection.id, e.target.value)}
                          id={`admin-inspection-status-${inspection.id}`}
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="IN_PROGRESS">IN_PROGRESS</option>
                          <option value="COMPLETED">COMPLETED</option>
                          <option value="CANCELLED">CANCELLED</option>
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-current opacity-60" />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenTriage(inspection)}
                        className="h-7 px-2.5 rounded-lg text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-200 flex items-center gap-1 cursor-pointer transition-all"
                        title="Assign Supervisor + Technicians"
                        id={`btn-triage-team-${inspection.id}`}
                      >
                        <UserCheck size={12} />
                        <span className="hidden sm:inline">Assign Team</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingAssigneesId(isEditingAssignees ? null : inspection.id)}
                        className="h-7 px-2 rounded-lg text-xs font-semibold bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-zinc-200 cursor-pointer transition-all"
                        title="Quick assign inline"
                      >
                        {isEditingAssignees ? 'Done' : 'Quick Techs'}
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleDeleteInspection(inspection.id)}
                        className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete Inspection"
                        id={`btn-delete-inspection-${inspection.id}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Assigned Supervisor & Technicians */}
                  <div className="flex items-center gap-3 flex-wrap text-xs pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Supervisor:</span>
                      {assignedSupervisor ? (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                          {assignedSupervisor.fullName}
                        </span>
                      ) : (
                        <span className="text-[11px] text-amber-600 font-medium">None assigned</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Technicians:</span>
                      {assignedTechs.length === 0 ? (
                        <span className="text-[11px] text-amber-600 font-medium">Unassigned</span>
                      ) : (
                        assignedTechs.map(tech => (
                          <span
                            key={tech.id}
                            className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200"
                          >
                            {tech.fullName}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Expandable Assignee Picker */}
                  {isEditingAssignees && (
                    <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2 animate-fade-in">
                      <p className="text-[11px] font-bold text-zinc-700">Select Technicians & Supervisors to Assign:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {fieldTechnicians.map(tech => {
                          const isAssigned = inspection.assignedTo.includes(tech.id);
                          return (
                            <button
                              key={tech.id}
                              type="button"
                              onClick={() => void handleToggleAssigneeOnInspection(inspection.id, inspection.assignedTo, tech.id)}
                              className={`text-xs font-bold px-2.5 py-1 rounded-full border cursor-pointer transition-all ${
                                isAssigned
                                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                                  : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                              }`}
                              id={`toggle-assign-${inspection.id}-${tech.id}`}
                            >
                              {isAssigned ? '✓ ' : '+ '}
                              {tech.fullName} ({tech.role})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Triage Assignment Modal */}
      {triageInspection && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
            <div className="p-5 border-b border-zinc-100 bg-gradient-to-r from-amber-50 to-orange-50 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                  Admin Team Assignment
                </span>
                <h3 className="text-base font-bold text-zinc-900 mt-1">Assign Supervisor &amp; Technicians</h3>
                <p className="text-xs text-zinc-500 font-medium truncate max-w-sm mt-0.5">
                  {triageInspection.title} ({triageInspection.siteName})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTriageInspection(null)}
                className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-white rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Customer info preview */}
              {triageInspection.reportedBy && (
                <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 text-xs">
                  <span className="text-zinc-400 font-semibold block text-[10px] uppercase">Reported by Customer:</span>
                  <span className="font-bold text-zinc-900">{triageInspection.reportedBy}</span>
                  {triageInspection.customerPhone && <span className="text-zinc-500 ml-2 font-mono">({triageInspection.customerPhone})</span>}
                  {triageInspection.customerNotes && (
                    <p className="text-zinc-600 mt-1 text-[11px] italic">"{triageInspection.customerNotes}"</p>
                  )}
                </div>
              )}

              {/* Select Supervisor */}
              <div>
                <label className="text-xs font-bold text-zinc-700 block mb-1">
                  1. Coordinating Supervisor <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    className="w-full h-10 px-3 pr-8 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    value={triageSupervisorId}
                    onChange={e => setTriageSupervisorId(e.target.value)}
                  >
                    <option value="">— Select Supervisor —</option>
                    {supervisors.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.fullName} ({s.email}) — SUPERVISOR
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
              </div>

              {/* Select Field Technicians */}
              <div>
                <label className="text-xs font-bold text-zinc-700 block mb-2">
                  2. Field Technicians (Field inspection &amp; work)
                </label>
                <div className="flex flex-wrap gap-2">
                  {fieldTechnicians.map(tech => {
                    const isSelected = triageTechnicianIds.includes(tech.id);
                    return (
                      <button
                        key={tech.id}
                        type="button"
                        onClick={() => {
                          setTriageTechnicianIds(prev =>
                            prev.includes(tech.id) ? prev.filter(id => id !== tech.id) : [...prev, tech.id]
                          );
                        }}
                        className={`text-xs font-bold px-3 py-1.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                            : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}
                        {tech.fullName} ({tech.role})
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-100 bg-zinc-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTriageInspection(null)}
                className="h-9 px-4 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-200/50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!triageSupervisorId}
                onClick={() => void handleConfirmAssignTeam()}
                className="h-9 px-5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-40 transition-all cursor-pointer shadow-sm shadow-amber-200"
                id="btn-confirm-assign-team"
              >
                Assign &amp; Dispatch to Supervisor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Assets ──────────────────────────────────────────────────────────────

function AssetsTab({
  showMessage,
}: {
  showMessage: (type: 'success' | 'error', text: string) => void;
}) {
  const assets = useLiveQuery(async () => {
    const all = await db.assets.toArray();
    return all.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, []) ?? [];
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    assetCode: '',
    location: '',
    type: 'MOTOR' as AssetType,
    manufacturer: '',
    model: '',
  });

  async function handleCreate() {
    if (!form.name.trim() || !form.assetCode.trim()) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const newAsset: Asset = {
        id: crypto.randomUUID(),
        name: form.name.trim(),
        assetCode: form.assetCode.trim().toUpperCase(),
        location: form.location.trim(),
        type: form.type as AssetType,
        manufacturer: form.manufacturer.trim() || undefined,
        model: form.model.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
      await db.assets.put(newAsset);
      showMessage('success', `Asset "${newAsset.name}" (${newAsset.assetCode}) created.`);
      setForm({ name: '', assetCode: '', location: '', type: 'MOTOR', manufacturer: '', model: '' });
      setShowCreate(false);
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to create asset.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAsset(assetId: string) {
    try {
      await db.assets.delete(assetId);
      showMessage('success', 'Asset removed.');
    } catch (err) {
      console.error('Failed to delete asset:', err);
      showMessage('error', 'Failed to delete asset.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-100">
          <h2 className="text-sm font-bold text-zinc-900">Equipment Assets ({assets.length})</h2>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="h-8 px-3 rounded-xl font-bold text-xs bg-zinc-900 text-white hover:bg-zinc-700 flex items-center gap-1.5 cursor-pointer transition-all"
            id="btn-admin-create-asset"
          >
            {showCreate ? <X size={13} /> : <Plus size={13} />}
            {showCreate ? 'Cancel' : 'Add Asset'}
          </button>
        </div>

        {showCreate && (
          <div className="p-4 border-b border-zinc-100 bg-zinc-50/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Asset Name</label>
                <input type="text" className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-400"
                  placeholder="Motor M-101" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} id="admin-asset-name" />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Asset Code</label>
                <input type="text" className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-sm font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-400"
                  placeholder="MTR-M101" value={form.assetCode} onChange={e => setForm(f => ({ ...f, assetCode: e.target.value }))} id="admin-asset-code" />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Type</label>
                <div className="relative">
                  <select className="w-full h-9 px-3 pr-8 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-900 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-400"
                    value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as AssetType }))} id="admin-asset-type">
                    <option>MOTOR</option><option>COMPRESSOR</option><option>PUMP</option><option>GENERATOR</option><option>CONVEYOR</option><option>OTHER</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Location</label>
                <input type="text" className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-400"
                  placeholder="Factory A — Bay 3" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} id="admin-asset-location" />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Manufacturer</label>
                <input type="text" className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-400"
                  placeholder="Siemens" value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} id="admin-asset-manufacturer" />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Model</label>
                <input type="text" className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-400"
                  placeholder="SIMOTICS SD" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} id="admin-asset-model" />
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => void handleCreate()} disabled={saving || !form.name.trim() || !form.assetCode.trim()}
                className="h-9 px-4 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-all flex items-center gap-1.5 cursor-pointer" id="btn-admin-save-asset">
                {saving ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
                {saving ? 'Saving…' : 'Add Asset'}
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-zinc-100">
          {assets.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-400 font-medium">No assets. Add assets or initialize sample data.</div>
          ) : (
            assets.map((asset: Asset) => (
              <div key={asset.id} className="flex items-center justify-between p-4 hover:bg-zinc-50/50 transition-colors" id={`admin-asset-${asset.id}`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-600 flex items-center justify-center shrink-0">
                    <Wrench size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 border border-indigo-200/60 px-1.5 py-0.5 rounded">{asset.assetCode}</span>
                      <p className="text-sm font-bold text-zinc-900">{asset.name}</p>
                    </div>
                    <p className="text-[11px] font-medium text-zinc-500 mt-0.5">{asset.type} · {asset.location || 'No location set'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {asset.manufacturer && (
                    <span className="text-[10px] font-medium text-zinc-500 hidden sm:inline">{asset.manufacturer}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDeleteAsset(asset.id)}
                    className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Delete Asset"
                    id={`btn-delete-asset-${asset.id}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab: System ──────────────────────────────────────────────────────────────

function SystemTab({
  showMessage,
}: {
  showMessage: (type: 'success' | 'error', text: string) => void;
}) {
  const [seeding, setSeeding] = useState(false);
  const inspectionCount = useLiveQuery(() => db.inspections.count(), []) ?? 0;
  const userCount = useLiveQuery(() => db.users.count(), []) ?? 0;
  const assetCount = useLiveQuery(() => db.assets.count(), []) ?? 0;
  const auditCount = useLiveQuery(() => db.auditEvents.count(), []) ?? 0;
  const conflictCount = useLiveQuery(() => db.conflicts.count(), []) ?? 0;
  const operationCount = useLiveQuery(() => db.operations.count(), []) ?? 0;
  const mediaCount = useLiveQuery(() => db.media.count(), []) ?? 0;
  const openConflictsCount = useLiveQuery(() => db.conflicts.where('status').equals('OPEN').count(), []) ?? 0;

  async function handleSeedData() {
    setSeeding(true);
    try {
      await seedLocalDatabase();
      showMessage('success', 'Industrial data initialized successfully into IndexedDB.');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Initialization failed.');
    } finally {
      setSeeding(false);
    }
  }

  async function handleResetAndSeedData() {
    setSeeding(true);
    try {
      await seedLocalDatabase(undefined, undefined, true);
      showMessage('success', 'Database reset and freshly re-seeded with 5 equipment inspections & 38 checklist items.');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Reset failed.');
    } finally {
      setSeeding(false);
    }
  }

  async function handleExportData() {
    try {
      const dump = {
        exportedAt: new Date().toISOString(),
        inspections: await db.inspections.toArray(),
        checklistItems: await db.checklistItems.toArray(),
        results: await db.inspectionResults.toArray(),
        notes: await db.notes.toArray(),
        media: await db.media.toArray(),
        operations: await db.operations.toArray(),
        conflicts: await db.conflicts.toArray(),
        auditEvents: await db.auditEvents.toArray(),
        users: await db.users.toArray(),
        assets: await db.assets.toArray(),
      };
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fieldsync-db-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showMessage('success', 'Database snapshot exported successfully.');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Export failed.');
    }
  }

  const stats = [
    { label: 'Users', value: userCount, color: 'text-sky-600' },
    { label: 'Inspections', value: inspectionCount, color: 'text-indigo-600' },
    { label: 'Assets', value: assetCount, color: 'text-purple-600' },
    { label: 'Audit Events', value: auditCount, color: 'text-zinc-600' },
    { label: 'Operations', value: operationCount, color: 'text-amber-600' },
    { label: 'Media Files', value: mediaCount, color: 'text-emerald-600' },
    { label: 'All Conflicts', value: conflictCount, color: 'text-rose-600' },
    { label: 'Open Conflicts', value: openConflictsCount, color: openConflictsCount > 0 ? 'text-rose-700 font-black' : 'text-zinc-400' },
  ];

  return (
    <div className="space-y-5">
      {/* DB Stats */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-zinc-900">Database Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map(({ label, value, color }) => (
            <div key={label} className="bg-zinc-50 border border-zinc-200/70 rounded-xl p-3 text-center">
              <div className={`text-2xl font-black font-mono ${color}`}>{value}</div>
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">{label}</div>
            </div>
          ))}
        </div>
        {openConflictsCount > 0 && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-2 font-medium">
            <AlertTriangle size={14} className="shrink-0" />
            <span>{openConflictsCount} open conflict{openConflictsCount !== 1 ? 's' : ''} require supervisor or admin resolution.</span>
          </div>
        )}
      </div>

      {/* Tools */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 text-zinc-900 font-bold mb-1.5 text-base">
              <Database size={18} className="text-indigo-600" />
              Initialize Industrial Inspections
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed font-medium">
              Populates IndexedDB with standard rotating equipment assets (Motors, Compressors, Pumps), checklist verification questions, and operational bounds.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => void handleSeedData()}
              disabled={seeding}
              className="flex-1 h-10 px-4 rounded-xl font-bold text-xs bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              id="btn-admin-seed-data"
            >
              <RefreshCw size={14} className={seeding ? 'animate-spin' : ''} />
              {seeding ? 'Processing…' : 'Initialize Equipment'}
            </button>
            <button
              onClick={() => void handleResetAndSeedData()}
              disabled={seeding}
              className="h-10 px-3 rounded-xl font-bold text-xs bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              title="Clear inspections and re-populate with fresh industrial seed data"
              id="btn-admin-reset-seed-data"
            >
              <RefreshCw size={13} className={seeding ? 'animate-spin' : ''} />
              Reset &amp; Re-Seed
            </button>
          </div>
        </div>

        <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 text-zinc-900 font-bold mb-1.5 text-base">
              <Download size={18} className="text-sky-600" />
              Export Local Inspection Database
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed font-medium">
              Download the entire client-side IndexedDB snapshot (inspections, checklists, audit trails, conflict logs, users, assets) as a structured JSON file.
            </p>
          </div>
          <button
            onClick={() => void handleExportData()}
            className="h-10 px-4 rounded-xl font-bold text-xs bg-white text-zinc-800 border border-zinc-200 hover:bg-zinc-50 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            id="btn-admin-export-data"
          >
            <Download size={14} />
            Export Database Snapshot (.json)
          </button>
        </div>
      </div>
    </div>
  );
}
