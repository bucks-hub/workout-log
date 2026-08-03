import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { SignIn } from './pages/SignIn';
import { FirstRunSetup } from './pages/FirstRunSetup';
import { Today } from './pages/Today';
import { History } from './pages/History';
import { Settings } from './pages/Settings';
import { BottomNav } from './components/BottomNav';
import type { TabType } from './components/BottomNav';
import { useStore } from './store/useStore';
import { loadFromServer, syncToServer, cleanupOrphanedSyncItems } from './lib/sync';
import { getSyncQueue, getAllLocalCategories, getAllLocalExercises } from './lib/db';
import './utils/debug';

function AppContent() {
  const { user, loading } = useAuth();
  const { setCategories, setExercises, setPendingSyncCount } = useStore();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('today');

  // Load user data on auth
  useEffect(() => {
    const init = async () => {
      if (!user) {
        setIsInitializing(false);
        return;
      }

      try {
        // 1. First, load from IndexedDB (instant, works offline)
        const localCats = await getAllLocalCategories();
        const localExs = await getAllLocalExercises();

        if (localCats.length > 0 || localExs.length > 0) {
          setCategories(localCats);
          setExercises(localExs);
          setNeedsSetup(localCats.length === 0);
        }

        // 2. Clean up any orphaned items from previous sessions
        const cleaned = await cleanupOrphanedSyncItems();
        if (cleaned > 0) {
          console.log(`Cleaned up ${cleaned} orphaned items from sync queue`);
        }

        // 3. Sync pending changes to server
        const synced = await syncToServer();
        console.log(`Synced ${synced} items to server`);

        // 4. Load fresh data from server (in background)
        const { categories: serverCats, exercises: serverExs } = await loadFromServer(
          user.id
        );

        // Update with server data if we got any
        if (serverCats.length > 0 || serverExs.length > 0) {
          setCategories(serverCats);
          setExercises(serverExs);
        }

        // Check if needs first-run setup
        const finalCats = serverCats.length > 0 ? serverCats : localCats;
        setNeedsSetup(finalCats.length === 0);

        // Update sync count
        const queue = await getSyncQueue();
        setPendingSyncCount(queue.length);
      } catch (error) {
        console.error('Error initializing:', error);
      } finally {
        setIsInitializing(false);
      }
    };

    init();
  }, [user, setCategories, setExercises, setPendingSyncCount]);

  // Periodic sync
  useEffect(() => {
    if (!user) return;

    const syncInterval = setInterval(async () => {
      await syncToServer();
      const queue = await getSyncQueue();
      setPendingSyncCount(queue.length);
    }, 30000);

    return () => clearInterval(syncInterval);
  }, [user, setPendingSyncCount]);

  // Sync on visibility change
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && user) {
        await syncToServer();
        const queue = await getSyncQueue();
        setPendingSyncCount(queue.length);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user, setPendingSyncCount]);

  // Sync on network reconnect
  useEffect(() => {
    const handleOnline = async () => {
      if (user) {
        await syncToServer();
        const queue = await getSyncQueue();
        setPendingSyncCount(queue.length);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [user, setPendingSyncCount]);

  if (loading || isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-[#f97316] border-t-transparent rounded-full animate-spin" />
          <div className="text-[#737373]">Loading...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <SignIn />;
  }

  if (needsSetup) {
    return <FirstRunSetup onComplete={() => setNeedsSetup(false)} />;
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {activeTab === 'today' && <Today />}
      {activeTab === 'history' && <History />}
      {activeTab === 'settings' && <Settings />}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
