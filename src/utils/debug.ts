import { getAllLocalCategories, getAllLocalExercises, getSyncQueue } from '../lib/db';
import { supabase } from '../lib/supabase';
import { cleanupAllData, syncToServer } from '../lib/sync';

/**
 * Debug utility to check data status
 * Open browser console and run: debugWorkoutLog()
 */
export async function debugWorkoutLog() {
  console.group('🔍 Workout Log Debug Info');

  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();
  console.log('👤 User:', user ? `Signed in as ${user.email}` : 'Not signed in');

  if (!user) {
    console.groupEnd();
    return { user: null };
  }

  // Check IndexedDB
  console.group('💾 IndexedDB (Local Storage)');
  const localCats = await getAllLocalCategories();
  const localExs = await getAllLocalExercises();
  console.log('Categories:', localCats.length, localCats);
  console.log('Exercises:', localExs.length, localExs);
  console.groupEnd();

  // Check Sync Queue
  console.group('📤 Sync Queue');
  const queue = await getSyncQueue();
  console.log('Pending items:', queue.length);
  if (queue.length > 0) {
    console.table(queue.map(item => ({
      table: item.table,
      action: item.action,
      id: item.payload?.id?.substring(0, 8) + '...',
      name: item.payload?.name || '-'
    })));
  }
  console.groupEnd();

  // Check Supabase
  console.group('☁️ Supabase (Server)');
  const { data: serverCats } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user.id);
  const { data: serverExs } = await supabase
    .from('exercises')
    .select('*')
    .eq('user_id', user.id);
  console.log('Categories:', serverCats?.length || 0, serverCats);
  console.log('Exercises:', serverExs?.length || 0, serverExs);
  console.groupEnd();

  console.groupEnd();

  console.log('\n📋 Available Commands:');
  console.log('  cleanupAllData() - Clear everything and start fresh');
  console.log('  syncToServer() - Force sync now');
  console.log('  debugWorkoutLog() - Show this debug info');

  return {
    user,
    local: { categories: localCats, exercises: localExs },
    syncQueue: queue,
    server: { categories: serverCats || [], exercises: serverExs || [] }
  };
}

/**
 * Complete cleanup - removes all data everywhere
 */
export async function fullCleanup() {
  console.log('🧹 Starting complete cleanup...');
  await cleanupAllData();
  console.log('🎉 Done! Reloading page...');
  setTimeout(() => location.reload(), 500);
}

// Make functions available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).debugWorkoutLog = debugWorkoutLog;
  (window as any).fullCleanup = fullCleanup;
  (window as any).cleanupAllData = cleanupAllData;
  (window as any).syncToServer = syncToServer;
}
