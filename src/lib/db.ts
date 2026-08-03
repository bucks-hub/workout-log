import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Session, Set, Category, Exercise } from '../types/database';

interface SyncQueueItem {
  id: string;
  action: 'create' | 'update' | 'delete';
  table: 'categories' | 'exercises' | 'sessions' | 'sets';
  payload: any;
  timestamp: number;
}

interface WorkoutLogDB extends DBSchema {
  syncQueue: {
    key: string;
    value: SyncQueueItem;
    indexes: { timestamp: number };
  };
  localSessions: {
    key: string; // session id
    value: Session;
  };
  localSets: {
    key: string; // set id
    value: Set;
    indexes: { sessionId: string; exerciseId: string };
  };
  localCategories: {
    key: string;
    value: Category;
  };
  localExercises: {
    key: string;
    value: Exercise;
    indexes: { categoryId: string };
  };
}

let dbInstance: IDBPDatabase<WorkoutLogDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<WorkoutLogDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<WorkoutLogDB>('workout-log', 1, {
    upgrade(db) {
      // Sync queue
      if (!db.objectStoreNames.contains('syncQueue')) {
        const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
        syncStore.createIndex('timestamp', 'timestamp');
      }

      // Local sessions
      if (!db.objectStoreNames.contains('localSessions')) {
        db.createObjectStore('localSessions', { keyPath: 'id' });
      }

      // Local sets
      if (!db.objectStoreNames.contains('localSets')) {
        const setsStore = db.createObjectStore('localSets', { keyPath: 'id' });
        setsStore.createIndex('sessionId', 'session_id');
        setsStore.createIndex('exerciseId', 'exercise_id');
      }

      // Local categories
      if (!db.objectStoreNames.contains('localCategories')) {
        db.createObjectStore('localCategories', { keyPath: 'id' });
      }

      // Local exercises
      if (!db.objectStoreNames.contains('localExercises')) {
        const exercisesStore = db.createObjectStore('localExercises', { keyPath: 'id' });
        exercisesStore.createIndex('categoryId', 'category_id');
      }
    },
  });

  return dbInstance;
}

// Sync queue operations
export async function addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'timestamp'>) {
  const db = await getDB();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    ...item,
    timestamp: Date.now(),
  };
  await db.add('syncQueue', queueItem);
  return queueItem;
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  return db.getAllFromIndex('syncQueue', 'timestamp');
}

export async function removeSyncQueueItem(id: string) {
  const db = await getDB();
  await db.delete('syncQueue', id);
}

export async function clearSyncQueue() {
  const db = await getDB();
  await db.clear('syncQueue');
}

// Local session operations
export async function saveLocalSession(session: Session) {
  const db = await getDB();
  await db.put('localSessions', session);
}

export async function getLocalSession(id: string): Promise<Session | undefined> {
  const db = await getDB();
  return db.get('localSessions', id);
}

export async function getAllLocalSessions(): Promise<Session[]> {
  const db = await getDB();
  return db.getAll('localSessions');
}

export async function getLocalSessionByDate(date: string): Promise<Session | undefined> {
  const db = await getDB();
  const sessions = await db.getAll('localSessions');
  return sessions.find(s => s.date === date);
}

// Local set operations
export async function saveLocalSet(set: Set) {
  const db = await getDB();
  await db.put('localSets', set);
}

export async function getLocalSetsBySession(sessionId: string): Promise<Set[]> {
  const db = await getDB();
  return db.getAllFromIndex('localSets', 'sessionId', sessionId);
}

export async function getLocalSetsByExercise(exerciseId: string): Promise<Set[]> {
  const db = await getDB();
  return db.getAllFromIndex('localSets', 'exerciseId', exerciseId);
}

export async function deleteLocalSet(id: string) {
  const db = await getDB();
  await db.delete('localSets', id);
}

// Local category operations
export async function saveLocalCategory(category: Category) {
  const db = await getDB();
  await db.put('localCategories', category);
}

export async function getAllLocalCategories(): Promise<Category[]> {
  const db = await getDB();
  return db.getAll('localCategories');
}

// Local exercise operations
export async function saveLocalExercise(exercise: Exercise) {
  const db = await getDB();
  await db.put('localExercises', exercise);
}

export async function getAllLocalExercises(): Promise<Exercise[]> {
  const db = await getDB();
  return db.getAll('localExercises');
}

export async function getLocalExercisesByCategory(categoryId: string): Promise<Exercise[]> {
  const db = await getDB();
  return db.getAllFromIndex('localExercises', 'categoryId', categoryId);
}
