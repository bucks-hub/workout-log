import { useStore } from '../store/useStore';
import { RefreshIcon, CheckIcon, CloseIcon } from './Icons';

export function SyncStatusBar() {
  const { syncStatus, pendingSyncCount, lastSyncTime } = useStore();

  // Don't show if idle and no pending
  if (syncStatus === 'idle' && pendingSyncCount === 0) {
    return null;
  }

  const formatLastSync = () => {
    if (!lastSyncTime) return '';
    const diff = Date.now() - lastSyncTime;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  };

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 px-4 py-2 text-sm flex items-center justify-center gap-2 transition-all ${
      syncStatus === 'syncing' ? 'bg-[#3b82f6]/10 text-[#3b82f6]' :
      syncStatus === 'success' ? 'bg-[#22c55e]/10 text-[#22c55e]' :
      syncStatus === 'error' ? 'bg-[#ef4444]/10 text-[#ef4444]' :
      pendingSyncCount > 0 ? 'bg-[#f97316]/10 text-[#f97316]' :
      'bg-[#1a1a1a] text-[#737373]'
    }`}>
      {syncStatus === 'syncing' && (
        <>
          <RefreshIcon className="w-4 h-4 animate-spin" />
          <span>Syncing...</span>
        </>
      )}
      {syncStatus === 'success' && (
        <>
          <CheckIcon className="w-4 h-4" />
          <span>Synced {formatLastSync()}</span>
        </>
      )}
      {syncStatus === 'error' && (
        <>
          <CloseIcon className="w-4 h-4" />
          <span>Sync failed</span>
        </>
      )}
      {syncStatus === 'idle' && pendingSyncCount > 0 && (
        <>
          <div className="w-2 h-2 bg-[#f97316] rounded-full animate-pulse" />
          <span>{pendingSyncCount} pending</span>
        </>
      )}
    </div>
  );
}
