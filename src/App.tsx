import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useSyncStore } from '@/stores/syncStore';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import AppShell from '@/components/layout/AppShell';
import RequireRole from '@/components/auth/RequireRole';
import LoginPage from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import InspectionList from '@/pages/InspectionList';
import InspectionDetail from '@/pages/InspectionDetail';
import ConflictCenter from '@/pages/ConflictCenter';
import SyncCenter from '@/pages/SyncCenter';
import AuditHistory from '@/pages/AuditHistory';
import AdminPanel from '@/pages/AdminPanel';
import Profile from '@/pages/Profile';

import { syncManager } from '@/lib/sync/syncManager';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm font-medium">Loading FieldSync...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const initSync = useSyncStore((s) => s.initialize);

  useEffect(() => {
    void initialize();
    initSync();

    // ── Android APK / TWA: Request persistent storage so Android
    //    does NOT evict IndexedDB when device storage is low.
    if ('storage' in navigator && 'persist' in navigator.storage) {
      navigator.storage.persist().then((persisted) => {
        if (persisted) {
          console.info('[FieldSync] IndexedDB storage is persistent (Android safe).');
        } else {
          console.warn('[FieldSync] Storage is best-effort; prompt user if needed.');
        }
      }).catch(() => {});
    }

    // ── Register Background Sync & Periodic Sync (Android PWA / TWA)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(async (reg) => {
        // 1. One-shot Background Sync (deferred replay on connection restore)
        if ('sync' in reg) {
          try {
            await (reg as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register('fieldsync-pending-ops');
            console.info('[FieldSync] Background Sync registered for pending ops.');
          } catch (e) {
            console.debug('[FieldSync] Background sync registration skipped:', e);
          }
        }

        // 2. Periodic Background Sync (runs in background on unmetered network)
        if ('periodicSync' in reg) {
          try {
            await (reg as unknown as { periodicSync: { register: (tag: string, options: { minInterval: number }) => Promise<void> } }).periodicSync.register('fieldsync-periodic-sync', {
              minInterval: 15 * 60 * 1000, // 15 minutes minimum interval
            });
            console.info('[FieldSync] Periodic Background Sync registered (15m interval).');
          } catch (e) {
            console.debug('[FieldSync] Periodic sync not permitted or supported:', e);
          }
        }
      }).catch(() => {});

      // 3. Listen for Background Sync triggers sent from Service Worker
      const handleSwMessage = (event: MessageEvent) => {
        if (event.data?.type === 'BACKGROUND_SYNC_TRIGGERED') {
          console.info('[FieldSync] Background sync triggered by Service Worker:', event.data.tag);
          void syncManager.syncNow();
        }
      };
      navigator.serviceWorker.addEventListener('message', handleSwMessage);

      // 4. Auto-sync on app resume / screen wake (visibility change)
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          console.info('[FieldSync] App brought to foreground, triggering auto-sync check.');
          void syncManager.syncNow();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [initialize, initSync]);

  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="inspections" element={<InspectionList />} />
            <Route path="inspections/:id" element={<InspectionDetail />} />
            <Route path="inspections/:id/:tab" element={<InspectionDetail />} />
            <Route path="inspections/:id/history" element={<AuditHistory />} />
            <Route path="conflicts" element={<ConflictCenter />} />
            <Route path="sync" element={<SyncCenter />} />
            <Route path="admin" element={
              <RequireRole roles={['ADMIN']}>
                <AdminPanel />
              </RequireRole>
            } />
            <Route path="profile" element={<Profile />} />
          </Route>
          {/* Catch-all route to handle 404 / unknown URLs */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}
