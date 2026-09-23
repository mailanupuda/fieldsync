import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useSyncStore } from '@/stores/syncStore';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/lib/i18n/LanguageContext';
import OfflineSearchModal from '../search/OfflineSearchModal';
import {
  LayoutDashboard,
  ClipboardList,
  AlertTriangle,
  RefreshCw,
  User,
  Shield,
  Wifi,
  WifiOff,
  LogOut,
  Search,
  Globe,
} from 'lucide-react';
import type { SupportedLanguage } from '@/lib/i18n/translations';

function StatusBar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { status, pendingOperations, pendingMedia, conflictCount, lastSuccessfulSync } = useSyncStore();
  const { user, signOut } = useAuthStore();
  const { t, language, setLanguage, supportedLanguages } = useI18n();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate('/login');
  }

  const formatLastSync = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const diffMins = Math.round((Date.now() - new Date(timestamp).getTime()) / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 bg-white/95 backdrop-blur border-b border-zinc-200/80 text-xs text-zinc-700 shadow-2xs z-20 flex-wrap sm:flex-nowrap">
      {/* Mobile Brand Logo */}
      <div className="flex items-center gap-2 md:hidden pr-1 border-r border-zinc-200">
        <img src="/logo.jpeg" alt="FieldSync" className="w-5 h-5 rounded-md object-cover border border-zinc-200 shadow-2xs" />
        <span className="font-black text-zinc-900 text-xs tracking-tight">FieldSync</span>
      </div>

      {/* Real Connection status */}
      <div className="flex items-center gap-1.5">
        {status === 'ONLINE' ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <Wifi size={13} />
            <span>Online</span>
            {lastSuccessfulSync && (
              <span className="text-[10px] text-emerald-600/80 hidden md:inline">
                · {formatLastSync(lastSuccessfulSync)}
              </span>
            )}
          </span>
        ) : status === 'SYNCING' ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-semibold bg-sky-50 text-sky-700 border border-sky-200/80">
            <RefreshCw size={13} className="animate-spin text-sky-600" />
            <span>Syncing…</span>
          </span>
        ) : status === 'SYNC_ERROR' ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-semibold bg-rose-50 text-rose-700 border border-rose-200/80">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>Sync Error</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-800 border border-amber-200/80">
            <WifiOff size={13} />
            <span>Offline</span>
            <span className="text-[10px] text-amber-700 hidden sm:inline">
              · {t.offlineAlert}
            </span>
          </span>
        )}
      </div>

      <div className="h-3.5 w-px bg-zinc-200 hidden sm:block" />

      {/* Pending operations */}
      {pendingOperations > 0 && (
        <span className="px-2 py-0.5 rounded-full font-mono font-bold text-[11px] bg-amber-50 text-amber-800 border border-amber-200">
          {pendingOperations} unsynced
        </span>
      )}

      {/* Pending photos */}
      {pendingMedia > 0 && (
        <span className="px-2 py-0.5 rounded-full font-mono font-bold text-[11px] bg-sky-50 text-sky-700 border border-sky-200 hidden sm:inline">
          {pendingMedia} media queued
        </span>
      )}

      {/* Conflicts */}
      {conflictCount > 0 && (
        <span className="px-2 py-0.5 rounded-full font-bold text-[11px] bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
          <AlertTriangle size={12} />
          {conflictCount}
        </span>
      )}

      {/* Right controls: Search, Language selector, User */}
      <div className="ml-auto flex items-center gap-2">
        {/* Offline Search Trigger */}
        <button
          onClick={onOpenSearch}
          className="h-8 px-2.5 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 transition-all"
          id="btn-search-trigger"
          title="Search assets & inspections locally (offline)"
        >
          <Search size={13} className="text-zinc-500" />
          <span className="hidden md:inline">{t.search}</span>
        </button>

        {/* Offline Language Selector */}
        <div className="relative flex items-center">
          <Globe size={13} className="absolute left-2.5 text-zinc-400 pointer-events-none" />
          <select
            value={language}
            onChange={(e) => void setLanguage(e.target.value as SupportedLanguage)}
            className="h-8 pl-7 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 cursor-pointer hover:bg-zinc-100 transition-colors focus:outline-none"
            id="select-language"
            title="Switch Language (Offline)"
          >
            {supportedLanguages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeName} ({l.code.toUpperCase()})
              </option>
            ))}
          </select>
        </div>

        {user && (
          <button
            onClick={() => void handleLogout()}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/80 border border-rose-200/70 rounded-lg transition-all cursor-pointer shadow-2xs"
            title={`Logout from ${user.fullName} (${user.role})`}
            id="btn-topbar-logout"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        )}
      </div>
    </div>
  );
}

function SideNav({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { user, signOut } = useAuthStore();
  const { conflictCount } = useSyncStore();
  const { t } = useI18n();
  const navigate = useNavigate();

  const role = user?.role ?? 'TECHNICIAN';
  const isAdminRole = role === 'ADMIN';
  const isCustomer = role === 'CUSTOMER';
  const isSupervisor = role === 'SUPERVISOR';

  async function handleLogout() {
    await signOut();
    navigate('/login');
  }

  // Role-tailored navigation items per Section 26 of specification
  const navItems = [
    { to: '/', label: t.dashboard, icon: LayoutDashboard, exact: true },
    {
      to: '/inspections',
      label: isCustomer
        ? 'My Issues'
        : isSupervisor
        ? 'Assigned Issues'
        : isAdminRole
        ? 'All Issues'
        : 'My Work',
      icon: ClipboardList,
    },
    // Only Supervisors and Admins handle CRDT business conflicts
    ...(!isCustomer && (isSupervisor || isAdminRole)
      ? [{ to: '/conflicts', label: t.conflicts, icon: AlertTriangle }]
      : []),
    // Field staff & management access sync status
    ...(!isCustomer
      ? [{ to: '/sync', label: t.sync, icon: RefreshCw }]
      : []),
    { to: '/profile', label: t.profile, icon: User },
  ];

  return (
    <nav className="w-60 bg-white border-r border-zinc-200/80 flex flex-col min-h-0 shrink-0">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-zinc-100">
        <div className="flex items-center gap-3">
          <img
            src="/logo.jpeg"
            alt="FieldSync Logo"
            className="w-9 h-9 rounded-xl object-cover shadow-sm border border-zinc-200/80"
          />
          <div>
            <p className="font-black text-zinc-900 text-base tracking-tight leading-tight">FieldSync</p>
            <p className="text-[11px] font-medium text-zinc-500">
              {isCustomer ? 'Customer Portal' : 'Field Operations'}
            </p>
          </div>
        </div>
      </div>

      {/* Offline Search trigger in sidebar */}
      <div className="px-3 pt-3">
        <button
          onClick={onOpenSearch}
          className="w-full h-10 px-3 rounded-xl border border-zinc-200 hover:border-zinc-300 bg-zinc-50 hover:bg-zinc-100 text-zinc-600 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-2xs"
          id="btn-sidebar-search"
        >
          <Search size={15} className="text-zinc-400" />
          <span>{t.searchPlaceholder.slice(0, 18)}...</span>
        </button>
      </div>

      {/* Nav items */}
      <div className="flex-1 py-3 space-y-1 px-3 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/80'
                }`
              }
            >
              <Icon size={18} className="shrink-0" />
              <span>{item.label}</span>
              {item.to === '/conflicts' && conflictCount > 0 && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-700 border border-rose-200">
                  {conflictCount}
                </span>
              )}
            </NavLink>
          );
        })}

        {isAdminRole && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
                isActive
                  ? 'bg-orange-50 text-orange-700 border border-orange-200/80 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/80'
              }`
            }
          >
            <Shield size={18} className="shrink-0 text-orange-500" />
            <span>{t.admin}</span>
          </NavLink>
        )}
      </div>

      {/* User profile card & Logout */}
      {user && (
        <div className="p-3 border-t border-zinc-100 space-y-2">
          <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/70 flex items-center gap-2.5 shadow-2xs">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 border ${
              user.role === 'CUSTOMER'
                ? 'bg-amber-100 border-amber-300 text-amber-800'
                : user.role === 'ADMIN'
                ? 'bg-orange-100 border-orange-200 text-orange-700'
                : user.role === 'SUPERVISOR'
                ? 'bg-purple-100 border-purple-200 text-purple-700'
                : 'bg-sky-100 border-sky-200 text-sky-700'
            }`}>
              {user.fullName ? user.fullName.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-zinc-900 truncate">{user.fullName}</p>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${
                user.role === 'CUSTOMER'
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : user.role === 'ADMIN'
                  ? 'bg-orange-50 text-orange-700 border-orange-200'
                  : user.role === 'SUPERVISOR'
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-sky-50 text-sky-700 border-sky-200'
              }`}>{user.role}</span>
            </div>
          </div>

          <button
            onClick={() => void handleLogout()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/80 border border-rose-200/60 transition-all cursor-pointer shadow-2xs"
            id="btn-sidebar-logout"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </nav>
  );
}

function BottomNav() {
  const { conflictCount } = useSyncStore();
  const { user, signOut } = useAuthStore();
  const { t } = useI18n();
  const navigate = useNavigate();

  const role = user?.role ?? 'TECHNICIAN';
  const isAdminRole = role === 'ADMIN';
  const isCustomer = role === 'CUSTOMER';
  const isSupervisor = role === 'SUPERVISOR';

  async function handleLogout() {
    await signOut();
    navigate('/login');
  }

  const navItems = [
    { to: '/', label: t.dashboard, icon: LayoutDashboard, exact: true },
    {
      to: '/inspections',
      label: isCustomer
        ? 'Issues'
        : isSupervisor
        ? 'Assigned'
        : isAdminRole
        ? 'All Issues'
        : 'My Work',
      icon: ClipboardList,
    },
    ...(!isCustomer && (isSupervisor || isAdminRole)
      ? [{ to: '/conflicts', label: t.conflicts, icon: AlertTriangle }]
      : []),
    ...(!isCustomer
      ? [{ to: '/sync', label: t.sync, icon: RefreshCw }]
      : []),
    { to: '/profile', label: t.profile, icon: User },
  ];

  return (
    <nav
      className="md:hidden bg-white/95 backdrop-blur-md border-t border-zinc-200/80 px-2 py-1.5 fixed bottom-0 left-0 right-0 z-30 shadow-lg"
      style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom, 0.375rem))' }}
    >
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors relative ${
                  isActive ? 'text-indigo-600 font-bold' : 'text-zinc-500 font-medium'
                }`
              }
            >
              <Icon size={18} />
              <span className="text-[10px]">{item.label}</span>
              {item.to === '/conflicts' && conflictCount > 0 && (
                <span className="absolute top-1 right-2 w-2 h-2 bg-rose-500 rounded-full animate-ping" />
              )}
            </NavLink>
          );
        })}

        {isAdminRole && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors relative ${
                isActive ? 'text-orange-600 font-bold' : 'text-zinc-500 font-medium'
              }`
            }
          >
            <Shield size={18} className="text-orange-500" />
            <span className="text-[10px] font-bold">Admin</span>
          </NavLink>
        )}

        <button
          onClick={() => void handleLogout()}
          className="flex flex-col items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors text-rose-600 hover:text-rose-700 font-medium cursor-pointer"
          id="btn-bottomnav-logout"
        >
          <LogOut size={18} />
          <span className="text-[10px]">Logout</span>
        </button>
      </div>
    </nav>
  );
}

export default function AppShell() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-zinc-900 overflow-hidden font-sans">
      <StatusBar onOpenSearch={() => setIsSearchOpen(true)} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden md:flex">
          <SideNav onOpenSearch={() => setIsSearchOpen(true)} />
        </div>

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div
            className="w-full px-4 py-4 sm:px-6 sm:py-5 md:pb-6"
            style={{ paddingBottom: 'max(5.5rem, calc(4.5rem + env(safe-area-inset-bottom, 0px)))' }}
          >
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav />

      {/* Offline Search Modal */}
      <OfflineSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </div>
  );
}
