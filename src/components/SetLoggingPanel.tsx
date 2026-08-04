import { useState, useEffect, useRef } from 'react';
import type { Exercise } from '../types/database';
import { useStore } from '../store/useStore';
import { createSet } from '../lib/sync';
import { getLocalSetsByExercise } from '../lib/db';
import { supabase } from '../lib/supabase';
import { CloseIcon, PlusIcon, MinusIcon, TrashIcon, ChartIcon, ChevronRightIcon, HistoryIcon } from './Icons';
import { formatDate } from '../utils/date';

interface SetLoggingPanelProps {
  exercise: Exercise;
  onClose: () => void;
  onViewProgress?: () => void;
}

interface LastPerformance {
  weight: number;
  reps: number;
  setCount: number;
  date: string;
}

interface RecentSession {
  date: string;
  sets: { weight: number; reps: number }[];
  topWeight: number;
}

// Default weight ladder (5-100 kg in 2.5 kg increments)
const DEFAULT_WEIGHTS = Array.from({ length: 39 }, (_, i) => 5 + i * 2.5);

export function SetLoggingPanel({ exercise, onClose, onViewProgress }: SetLoggingPanelProps) {
  const { user, currentSession, currentSets, addSet, deleteSet } = useStore();

  const [availableWeights, setAvailableWeights] = useState<number[]>([]);
  const [selectedWeight, setSelectedWeight] = useState<number>(0);
  const [reps, setReps] = useState<number>(10);
  const [lastPerformance, setLastPerformance] = useState<LastPerformance | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [customWeight, setCustomWeight] = useState<string>('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const weightPickerRef = useRef<HTMLDivElement>(null);

  // Get sets for this exercise in current session
  const todaySets = currentSets.filter((s) => s.exercise_id === exercise.id);

  useEffect(() => {
    loadWeightsAndDefaults();
  }, [exercise.id]);

  // Scroll to selected weight when panel opens
  useEffect(() => {
    if (selectedWeight && weightPickerRef.current) {
      const selectedElement = weightPickerRef.current.querySelector(`[data-weight="${selectedWeight}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [availableWeights, selectedWeight]);

  const loadWeightsAndDefaults = async () => {
    if (!user) return;

    // Load all sets for this exercise to determine available weights
    const exerciseSets = await getLocalSetsByExercise(exercise.id);

    // Also try to load from server
    const { data: serverSets } = await supabase
      .from('sets')
      .select('*')
      .eq('exercise_id', exercise.id)
      .eq('user_id', user.id);

    const allSets = [...exerciseSets, ...(serverSets || [])];

    // Get distinct weights for this exercise
    const weights = [...new Set(allSets.map((s) => s.weight))].sort((a, b) => a - b);

    let finalWeights: number[];

    if (weights.length >= 3) {
      finalWeights = weights;
    } else if (weights.length > 0) {
      const { data: allUserSets } = await supabase
        .from('sets')
        .select('weight')
        .eq('user_id', user.id);

      const allWeights = [
        ...new Set([...weights, ...(allUserSets?.map((s) => s.weight) || [])]),
      ].sort((a, b) => a - b);

      finalWeights = allWeights.length > 0 ? allWeights : DEFAULT_WEIGHTS;
    } else {
      finalWeights = DEFAULT_WEIGHTS;
    }

    setAvailableWeights(finalWeights);

    // Load last performance and recent sessions
    if (allSets.length > 0) {
      // Group sets by session
      const setsBySession = new Map<string, typeof allSets>();
      for (const set of allSets) {
        if (set.session_id === currentSession?.id) continue;
        const existing = setsBySession.get(set.session_id) || [];
        existing.push(set);
        setsBySession.set(set.session_id, existing);
      }

      // Get session dates
      const sessionIds = Array.from(setsBySession.keys());
      if (sessionIds.length > 0) {
        const { data: sessionsData } = await supabase
          .from('sessions')
          .select('id, date')
          .in('id', sessionIds)
          .order('date', { ascending: false });

        if (sessionsData && sessionsData.length > 0) {
          // Build recent sessions list (last 5)
          const recent: RecentSession[] = [];
          for (const session of sessionsData.slice(0, 5)) {
            const sessionSets = setsBySession.get(session.id) || [];
            if (sessionSets.length === 0) continue;

            const sortedSets = sessionSets
              .sort((a, b) => a.set_number - b.set_number)
              .map((s) => ({ weight: s.weight, reps: s.reps }));

            recent.push({
              date: session.date,
              sets: sortedSets,
              topWeight: Math.max(...sessionSets.map((s) => s.weight)),
            });
          }
          setRecentSessions(recent);

          // Set last performance from most recent session
          if (recent.length > 0) {
            const lastSession = recent[0];
            const topSet = lastSession.sets.reduce((max, set) =>
              set.weight > max.weight ? set : max
            );
            setLastPerformance({
              weight: topSet.weight,
              reps: topSet.reps,
              setCount: lastSession.sets.length,
              date: lastSession.date,
            });
          }
        }
      }
    }

    // Set defaults
    if (todaySets.length > 0) {
      const lastSet = todaySets[todaySets.length - 1];
      setSelectedWeight(lastSet.weight);
      setReps(lastSet.reps);
    } else if (allSets.length > 0) {
      const lastSet = allSets.sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      )[0];
      setSelectedWeight(lastSet.weight);
      setReps(lastSet.reps);
    } else {
      setSelectedWeight(finalWeights[Math.floor(finalWeights.length / 3)] || 20);
      setReps(10);
    }
  };

  const handleAddSet = async () => {
    if (!user || !currentSession) return;

    const setNumber = todaySets.length + 1;

    const newSet = await createSet(
      user.id,
      currentSession.id,
      exercise.id,
      setNumber,
      selectedWeight,
      reps
    );

    addSet(newSet);
  };

  const handleDeleteSet = async (setId: string) => {
    deleteSet(setId);

    // Delete from IndexedDB
    const { deleteLocalSet, addToSyncQueue } = await import('../lib/db');
    await deleteLocalSet(setId);

    // Add to sync queue
    await addToSyncQueue({
      action: 'delete',
      table: 'sets',
      payload: { id: setId },
    });

    // Immediately sync to server
    const { syncToServer } = await import('../lib/sync');
    syncToServer().catch(console.error);
  };

  const handleCustomWeight = () => {
    const weight = parseFloat(customWeight);
    if (weight > 0) {
      setSelectedWeight(weight);
      if (!availableWeights.includes(weight)) {
        setAvailableWeights([...availableWeights, weight].sort((a, b) => a - b));
      }
      setShowCustomInput(false);
      setCustomWeight('');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1a1a1a]">
          <div>
            <h2 className="text-lg font-semibold text-white">{exercise.name}</h2>
            {lastPerformance && (
              <p className="text-sm text-[#737373]">
                Last: <span className="text-[#f97316] number">{lastPerformance.weight}kg × {lastPerformance.reps} × {lastPerformance.setCount}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onViewProgress && (
              <button onClick={onViewProgress} className="btn-icon">
                <ChartIcon className="w-5 h-5" />
              </button>
            )}
            <button onClick={onClose} className="btn-icon">
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-6">
          {/* Weight picker */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm text-[#a3a3a3]">Weight (kg)</label>
              <span className="text-2xl font-bold text-[#f97316] number">{selectedWeight}</span>
            </div>
            <div
              ref={weightPickerRef}
              className="flex gap-2 overflow-x-auto scrollbar-hide py-2 -mx-4 px-4"
            >
              {availableWeights.map((weight) => (
                <button
                  key={weight}
                  data-weight={weight}
                  onClick={() => setSelectedWeight(weight)}
                  className={`weight-chip number ${selectedWeight === weight ? 'selected' : ''}`}
                >
                  {weight}
                </button>
              ))}
            </div>

            {showCustomInput ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.5"
                  value={customWeight}
                  onChange={(e) => setCustomWeight(e.target.value)}
                  placeholder="Custom weight"
                  className="input flex-1"
                  autoFocus
                  onKeyPress={(e) => e.key === 'Enter' && handleCustomWeight()}
                />
                <button onClick={handleCustomWeight} className="btn-primary">
                  Add
                </button>
                <button onClick={() => setShowCustomInput(false)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowCustomInput(true)}
                className="text-sm text-[#f97316] hover:underline"
              >
                + Custom weight
              </button>
            )}
          </div>

          {/* Recent History (collapsible) */}
          {recentSessions.length > 0 && (
            <div className="border border-[#1a1a1a] rounded-xl overflow-hidden">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="w-full flex items-center justify-between p-3 bg-[#0d0d0d] hover:bg-[#1a1a1a] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <HistoryIcon className="w-4 h-4 text-[#f97316]" />
                  <span className="text-sm font-medium text-white">Recent History</span>
                  <span className="text-xs text-[#525252]">
                    ({recentSessions.length} sessions)
                  </span>
                </div>
                <ChevronRightIcon
                  className={`w-4 h-4 text-[#525252] transition-transform ${
                    showHistory ? 'rotate-90' : ''
                  }`}
                />
              </button>

              {showHistory && (
                <div className="border-t border-[#1a1a1a] divide-y divide-[#1a1a1a]">
                  {recentSessions.map((session) => (
                    <div key={session.date} className="p-3 bg-[#0a0a0a]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-[#a3a3a3]">
                          {formatDate(session.date)}
                        </span>
                        <span className="text-xs text-[#737373]">
                          Top: <span className="text-[#f97316] number">{session.topWeight}kg</span>
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {session.sets.map((set, setIdx) => (
                          <button
                            key={setIdx}
                            onClick={() => {
                              setSelectedWeight(set.weight);
                              setReps(set.reps);
                              setShowHistory(false);
                            }}
                            className="bg-[#1a1a1a] hover:bg-[#262626] rounded px-2 py-1 text-xs transition-colors"
                            title="Click to use these values"
                          >
                            <span className="text-white number">{set.weight}</span>
                            <span className="text-[#525252]">kg</span>
                            <span className="text-[#f97316] ml-1">×{set.reps}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reps stepper */}
          <div className="space-y-3">
            <label className="text-sm text-[#a3a3a3]">Reps</label>
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => setReps(Math.max(1, reps - 1))}
                className="btn-secondary w-16 h-16 !p-0 !rounded-full"
              >
                <MinusIcon className="w-6 h-6" />
              </button>
              <span className="text-5xl font-bold text-white number w-24 text-center">
                {reps}
              </span>
              <button
                onClick={() => setReps(reps + 1)}
                className="btn-secondary w-16 h-16 !p-0 !rounded-full"
              >
                <PlusIcon className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Add set button */}
          <button onClick={handleAddSet} className="btn-primary w-full text-lg">
            <PlusIcon className="w-5 h-5" />
            Add Set
          </button>

          {/* Today's sets */}
          {todaySets.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm text-[#a3a3a3]">Today's Sets</h3>
              <div className="space-y-2">
                {todaySets.map((set, index) => (
                  <div
                    key={set.id}
                    className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-[#262626] flex items-center justify-center text-sm font-medium text-[#a3a3a3]">
                        {index + 1}
                      </span>
                      <span className="text-white number font-medium">
                        {set.weight} kg × {set.reps}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteSet(set.id)}
                      className="btn-icon text-[#ef4444] hover:bg-[#ef4444]/10"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
