import { supabase } from './supabase';
import {
  getSyncQueue,
  removeSyncQueueItem,
  addToSyncQueue,
  saveLocalSession,
  saveLocalSet,
  saveLocalCategory,
  saveLocalExercise,
  clearSyncQueue,
  getDB,
} from './db';
import type { Category, Exercise, Session, Set } from '../types/database';
import { v4 as uuidv4 } from 'uuid';

// Mutex to prevent concurrent syncs
let isSyncing = false;

/**
 * Sync all pending changes to Supabase
 * Items are synced in dependency order to respect foreign key constraints
 */
export async function syncToServer(): Promise<number> {
  // Prevent concurrent syncs
  if (isSyncing) {
    return 0;
  }

  isSyncing = true;

  try {
    const queue = await getSyncQueue();
    let syncedCount = 0;

    if (queue.length === 0) {
      return 0;
    }

    // Sort queue by dependency order: categories → exercises → sessions → sets
    const tableOrder = { categories: 1, exercises: 2, sessions: 3, sets: 4 };
    const sortedQueue = [...queue].sort((a, b) => {
      const orderA = tableOrder[a.table as keyof typeof tableOrder] || 999;
      const orderB = tableOrder[b.table as keyof typeof tableOrder] || 999;
      return orderA - orderB;
    });

    for (const item of sortedQueue) {
      try {
        let success = false;

        switch (item.table) {
          case 'categories':
            success = await syncCategory(item.action, item.payload);
            break;
          case 'exercises':
            success = await syncExercise(item.action, item.payload);
            break;
          case 'sessions':
            success = await syncSession(item.action, item.payload);
            break;
          case 'sets':
            success = await syncSet(item.action, item.payload);
            break;
        }

        if (success) {
          await removeSyncQueueItem(item.id);
          syncedCount++;
        }
      } catch (error: any) {
        console.error(`Failed to sync ${item.table} ${item.action}:`, error);

        // If it's a foreign key error (orphaned data), remove from queue
        if (error?.code === '23503') {
          console.warn(`Removing orphaned ${item.table} from queue (missing parent)`);
          await removeSyncQueueItem(item.id);
        }
        // If it's a duplicate key error, it's already synced - remove from queue
        else if (error?.code === '23505') {
          console.warn(`Removing duplicate ${item.table} from queue (already exists)`);
          await removeSyncQueueItem(item.id);
        }
      }
    }

    return syncedCount;
  } finally {
    isSyncing = false;
  }
}

async function syncCategory(action: string, payload: Category): Promise<boolean> {
  if (action === 'create' || action === 'update') {
    const { error } = await supabase
      .from('categories')
      .upsert(payload, { onConflict: 'id' });
    if (error) throw error;
    return true;
  } else if (action === 'delete') {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', payload.id);
    if (error) throw error;
    return true;
  }
  return false;
}

async function syncExercise(action: string, payload: Exercise): Promise<boolean> {
  if (action === 'create' || action === 'update') {
    // Check if the category exists (use limit 1 instead of single to avoid 406)
    const { data: categories } = await supabase
      .from('categories')
      .select('id')
      .eq('id', payload.category_id)
      .limit(1);

    if (!categories || categories.length === 0) {
      // Category doesn't exist yet, keep in queue for retry
      return false;
    }

    const { error } = await supabase
      .from('exercises')
      .upsert(payload, { onConflict: 'id' });
    if (error) throw error;
    return true;
  } else if (action === 'delete') {
    const { error } = await supabase
      .from('exercises')
      .delete()
      .eq('id', payload.id);
    if (error) throw error;
    return true;
  }
  return false;
}

async function syncSession(action: string, payload: Session): Promise<boolean> {
  if (action === 'create' || action === 'update') {
    // Check if a session for this user+date already exists (use limit 1 instead of single)
    const { data: existingSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('user_id', payload.user_id)
      .eq('date', payload.date)
      .limit(1);

    if (existingSessions && existingSessions.length > 0) {
      // Session exists - update it with the new data
      const { error } = await supabase
        .from('sessions')
        .update({
          body_weight: payload.body_weight,
          sleep_hours: payload.sleep_hours,
          sleep_quality: payload.sleep_quality,
          energy: payload.energy,
        })
        .eq('id', existingSessions[0].id);
      if (error) throw error;
    } else {
      // No session exists - insert new one
      const { error } = await supabase
        .from('sessions')
        .insert(payload);
      if (error) throw error;
    }
    return true;
  } else if (action === 'delete') {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', payload.id);
    if (error) throw error;
    return true;
  }
  return false;
}

async function syncSet(action: string, payload: Set): Promise<boolean> {
  if (action === 'create' || action === 'update') {
    // Check if the session exists in Supabase (use limit 1 instead of single)
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('id', payload.session_id)
      .limit(1);

    if (!sessions || sessions.length === 0) {
      // Session doesn't exist yet - keep set in queue for next sync attempt
      return false;
    }

    // Check if exercise exists
    const { data: exercises } = await supabase
      .from('exercises')
      .select('id')
      .eq('id', payload.exercise_id)
      .limit(1);

    if (!exercises || exercises.length === 0) {
      // Exercise doesn't exist - this is a real error, remove from queue
      throw { code: '23503', message: 'Exercise not found' };
    }

    const { error } = await supabase
      .from('sets')
      .upsert(payload, { onConflict: 'id' });
    if (error) throw error;
    return true;
  } else if (action === 'delete') {
    const { error } = await supabase.from('sets').delete().eq('id', payload.id);
    if (error) throw error;
    return true;
  }
  return false;
}

/**
 * Clean up all data and start fresh
 */
export async function cleanupAllData(): Promise<void> {
  console.log('Starting complete cleanup...');

  // 1. Clear sync queue
  await clearSyncQueue();
  console.log('Cleared sync queue');

  // 2. Clear all IndexedDB stores
  const db = await getDB();
  await db.clear('localCategories');
  await db.clear('localExercises');
  await db.clear('localSessions');
  await db.clear('localSets');
  console.log('Cleared IndexedDB');

  // 3. Delete all data from Supabase (in correct order)
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('sets').delete().eq('user_id', user.id);
    await supabase.from('sessions').delete().eq('user_id', user.id);
    await supabase.from('exercises').delete().eq('user_id', user.id);
    await supabase.from('categories').delete().eq('user_id', user.id);
    console.log('Cleared Supabase data');
  }

  console.log('Cleanup complete! Reload the page.');
}

/**
 * Load all data from server and cache locally
 */
export async function loadFromServer(userId: string) {
  // Load categories
  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order');

  if (catError) throw catError;

  for (const cat of categories || []) {
    await saveLocalCategory(cat);
  }

  // Load exercises
  const { data: exercises, error: exError } = await supabase
    .from('exercises')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order');

  if (exError) throw exError;

  for (const ex of exercises || []) {
    await saveLocalExercise(ex);
  }

  return { categories: categories || [], exercises: exercises || [] };
}

/**
 * Load sessions and sets for a specific date range
 */
export async function loadSessionsFromServer(
  userId: string,
  startDate?: string,
  endDate?: string
) {
  let query = supabase
    .from('sessions')
    .select('*, sets(*)')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (startDate) {
    query = query.gte('date', startDate);
  }
  if (endDate) {
    query = query.lte('date', endDate);
  }

  const { data: sessions, error } = await query;

  if (error) throw error;

  // Cache locally
  for (const session of sessions || []) {
    await saveLocalSession(session);
    if (session.sets) {
      for (const set of session.sets) {
        await saveLocalSet(set);
      }
    }
  }

  return sessions || [];
}

/**
 * Create a category (optimistically)
 */
export async function createCategory(
  userId: string,
  name: string,
  sortOrder: number
): Promise<Category> {
  const category: Category = {
    id: uuidv4(),
    user_id: userId,
    name,
    sort_order: sortOrder,
    created_at: new Date().toISOString(),
  };

  await saveLocalCategory(category);
  await addToSyncQueue({ action: 'create', table: 'categories', payload: category });

  // Immediately try to sync
  syncToServer().catch(console.error);

  return category;
}

/**
 * Create an exercise (optimistically)
 */
export async function createExercise(
  userId: string,
  categoryId: string,
  name: string,
  sortOrder: number
): Promise<Exercise> {
  const exercise: Exercise = {
    id: uuidv4(),
    user_id: userId,
    category_id: categoryId,
    name,
    sort_order: sortOrder,
    created_at: new Date().toISOString(),
  };

  await saveLocalExercise(exercise);
  await addToSyncQueue({ action: 'create', table: 'exercises', payload: exercise });

  // Immediately try to sync
  syncToServer().catch(console.error);

  return exercise;
}

/**
 * Create or update a session (optimistically)
 */
export async function upsertSession(session: Session): Promise<Session> {
  await saveLocalSession(session);
  await addToSyncQueue({ action: 'create', table: 'sessions', payload: session });

  return session;
}

/**
 * Create a set (optimistically)
 */
export async function createSet(
  userId: string,
  sessionId: string,
  exerciseId: string,
  setNumber: number,
  weight: number,
  reps: number
): Promise<Set> {
  const set: Set = {
    id: uuidv4(),
    user_id: userId,
    session_id: sessionId,
    exercise_id: exerciseId,
    set_number: setNumber,
    weight,
    reps,
    created_at: new Date().toISOString(),
  };

  await saveLocalSet(set);
  await addToSyncQueue({ action: 'create', table: 'sets', payload: set });

  // Immediately try to sync (session will be synced first due to dependency ordering)
  syncToServer().catch(console.error);

  return set;
}

/**
 * Clean up orphaned items from the sync queue
 * This removes sets that reference sessions that don't exist
 */
export async function cleanupOrphanedSyncItems(): Promise<number> {
  const queue = await getSyncQueue();
  let removedCount = 0;

  // Get all local sessions
  const db = await getDB();
  const localSessions = await db.getAll('localSessions');
  const sessionIds = new Set(localSessions.map(s => s.id));

  // Get all server sessions
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: serverSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('user_id', user.id);

    if (serverSessions) {
      serverSessions.forEach(s => sessionIds.add(s.id));
    }
  }

  // Remove sets from queue that reference non-existent sessions
  for (const item of queue) {
    if (item.table === 'sets' && item.payload?.session_id) {
      if (!sessionIds.has(item.payload.session_id)) {
        console.log(`Removing orphaned set from queue (session ${item.payload.session_id} not found)`);
        await removeSyncQueueItem(item.id);
        removedCount++;
      }
    }
  }

  return removedCount;
}

// Make cleanup available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).cleanupAllData = cleanupAllData;
  (window as any).syncToServer = syncToServer;
  (window as any).cleanupOrphanedSyncItems = cleanupOrphanedSyncItems;
}
