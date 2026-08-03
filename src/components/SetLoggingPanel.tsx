import { useState, useEffect, useRef } from 'react';
import type { Exercise } from '../types/database';
import { useStore } from '../store/useStore';
import { createSet } from '../lib/sync';
import { getLocalSetsByExercise } from '../lib/db';
import { supabase } from '../lib/supabase';
import { CloseIcon, PlusIcon, MinusIcon, TrashIcon, ChartIcon } from './Icons';

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

// Default weight ladder (5-100 kg in 2.5 kg increments)
const DEFAULT_WEIGHTS = Array.from({ length: 39 }, (_, i) => 5 + i * 2.5);

export function SetLoggingPanel({ exercise, onClose, onViewProgress }: SetLoggingPanelProps) {
  const { user, currentSession, currentSets, addSet, deleteSet } = useStore();

  const [availableWeights, setAvailableWeights] = useState<number[]>([]);
  const [selectedWeight, setSelectedWeight] = useState<number>(0);
  const [reps, setReps] = useState<number>(10);
  const [lastPerformance, setLastPerformance] = useState<LastPerformance | null>(null);
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

    // Load last performance
    if (allSets.length > 0) {
      const lastSessionSets = allSets
        .filter((s) => s.session_id !== currentSession?.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));

      if (lastSessionSets.length > 0) {
        const lastSession = lastSessionSets[0].session_id;
        const lastSets = allSets.filter((s) => s.session_id === lastSession);

        const heaviestSet = lastSets.reduce((max, set) =>
          set.weight > max.weight ? set : max
        );

        const { data: sessions } = await supabase
          .from('sessions')
          .select('date')
          .eq('id', lastSession)
          .limit(1);

        setLastPerformance({
          weight: heaviestSet.weight,
          reps: heaviestSet.reps,
          setCount: lastSets.length,
          date: sessions?.[0]?.date || 'Unknown',
        });
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
    const { deleteLocalSet } = await import('../lib/db');
    await deleteLocalSet(setId);

    // Add to sync queue
    const { addToSyncQueue } = await import('../lib/db');
    await addToSyncQueue({
      action: 'delete',
      table: 'sets',
      payload: { id: setId },
    });
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
