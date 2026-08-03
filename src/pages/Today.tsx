import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { getTodayDate, formatDate } from '../utils/date';
import { v4 as uuidv4 } from 'uuid';
import { SetLoggingPanel } from '../components/SetLoggingPanel';
import { ManageEquipment } from './ManageEquipment';
import { ExerciseDetail } from './ExerciseDetail';
import { SessionDetailsModal } from '../components/SessionDetailsModal';
import { upsertSession, syncToServer } from '../lib/sync';
import { supabase } from '../lib/supabase';
import { getLocalSessionByDate, getLocalSetsBySession } from '../lib/db';
import { PlusIcon, ScaleIcon, ChartIcon } from '../components/Icons';
import type { Exercise, Session } from '../types/database';

export function Today() {
  const {
    user,
    categories,
    exercises,
    currentSession,
    currentSets,
    setCurrentSession,
    setCurrentSets,
    pendingSyncCount,
  } = useStore();

  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [showManageEquipment, setShowManageEquipment] = useState(false);
  const [showExerciseDetail, setShowExerciseDetail] = useState<Exercise | null>(null);
  const [showSessionDetails, setShowSessionDetails] = useState(false);

  useEffect(() => {
    const initSession = async () => {
      if (!user || currentSession) return;

      const todayDate = getTodayDate();

      // First, check if a session for today already exists locally
      let existingSession = await getLocalSessionByDate(todayDate);

      // If not found locally, check the server
      if (!existingSession) {
        const { data: serverSessions } = await supabase
          .from('sessions')
          .select('*')
          .eq('user_id', user.id)
          .eq('date', todayDate)
          .limit(1);

        if (serverSessions && serverSessions.length > 0) {
          existingSession = serverSessions[0];
        }
      }

      if (existingSession) {
        // Use existing session
        setCurrentSession(existingSession);

        // Load sets for this session
        const localSets = await getLocalSetsBySession(existingSession.id);
        if (localSets.length > 0) {
          setCurrentSets(localSets);
        } else {
          // Try loading from server
          const { data: serverSets } = await supabase
            .from('sets')
            .select('*')
            .eq('session_id', existingSession.id);
          if (serverSets && serverSets.length > 0) {
            setCurrentSets(serverSets);
          }
        }
      } else {
        // Create new session
        const session: Session = {
          id: uuidv4(),
          user_id: user.id,
          date: todayDate,
          created_at: new Date().toISOString(),
        };

        setCurrentSession(session);

        // Save session immediately to IndexedDB and sync queue
        await upsertSession(session);
        syncToServer().catch(console.error);
      }
    };

    initSession();
  }, [user, currentSession, setCurrentSession]);

  // Group exercises by category
  const exercisesByCategory = categories
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((category) => ({
      category,
      exercises: exercises
        .filter((ex) => ex.category_id === category.id)
        .sort((a, b) => a.sort_order - b.sort_order),
    }))
    .filter((group) => group.exercises.length > 0);

  // Get today's sets for each exercise
  const getTodaySets = (exerciseId: string) => {
    return currentSets.filter((set) => set.exercise_id === exerciseId);
  };

  const handleExerciseClick = (exercise: Exercise) => {
    setSelectedExercise(exercise);
  };

  const handleClosePanel = () => {
    setSelectedExercise(null);
  };

  const handleSessionDetailsUpdate = async (updates: Partial<Session>) => {
    if (!currentSession) return;

    const updatedSession = { ...currentSession, ...updates };
    setCurrentSession(updatedSession);
    await upsertSession(updatedSession);
    syncToServer().catch(console.error);
  };

  const handleFinishSession = async () => {
    if (!currentSession || currentSets.length === 0) return;

    // Save session
    await upsertSession(currentSession);
    await syncToServer();

    // Clear current state for new session
    setCurrentSession(null);
    setCurrentSets([]);
  };

  const hasLoggedToday = currentSets.length > 0;
  const totalSetsToday = currentSets.length;
  const topWeightToday = currentSets.length > 0
    ? Math.max(...currentSets.map((s) => s.weight))
    : 0;

  if (!user) return null;

  return (
    <div className="page">
      {/* Header */}
      <div className="sticky top-0 bg-black border-b border-[#1a1a1a] p-4 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {formatDate(getTodayDate())}
            </h1>
            <p className="text-sm text-[#737373]">
              {hasLoggedToday ? (
                <span>
                  <span className="text-[#f97316] number">{totalSetsToday}</span> sets ·
                  Top <span className="text-[#f97316] number">{topWeightToday}</span> kg
                </span>
              ) : (
                "Today's workout"
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pendingSyncCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-[#f97316] bg-[#f97316]/10 px-3 py-1.5 rounded-full">
                <div className="w-2 h-2 bg-[#f97316] rounded-full animate-pulse" />
                {pendingSyncCount}
              </div>
            )}
            <button
              onClick={() => setShowSessionDetails(true)}
              className="btn-icon"
              title="Session details"
            >
              <ScaleIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowManageEquipment(true)}
              className="btn-icon"
              title="Manage equipment"
            >
              <PlusIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Exercise list */}
      <div className="p-4 space-y-6">
        {exercisesByCategory.length === 0 ? (
          <div className="empty-state">
            <div className="w-16 h-16 rounded-full bg-[#1a1a1a] flex items-center justify-center mb-4">
              <PlusIcon className="w-8 h-8 text-[#525252]" />
            </div>
            <div className="empty-state-title">No exercises yet</div>
            <div className="empty-state-text">
              Add categories and exercises to start logging your workouts
            </div>
            <button
              onClick={() => setShowManageEquipment(true)}
              className="btn-primary"
            >
              <PlusIcon className="w-5 h-5" />
              Add Equipment
            </button>
          </div>
        ) : (
          exercisesByCategory.map(({ category, exercises: categoryExercises }) => (
            <div key={category.id} className="space-y-2">
              <h2 className="text-xs font-semibold text-[#737373] uppercase tracking-wider px-1">
                {category.name}
              </h2>
              <div className="space-y-2">
                {categoryExercises.map((exercise) => {
                  const todaySets = getTodaySets(exercise.id);
                  const hasLogged = todaySets.length > 0;
                  const topWeight = hasLogged
                    ? Math.max(...todaySets.map((s) => s.weight))
                    : 0;

                  return (
                    <div key={exercise.id} className="flex gap-2">
                      <button
                        onClick={() => handleExerciseClick(exercise)}
                        className={`exercise-card flex-1 ${hasLogged ? 'logged' : ''}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-white font-medium">
                            {exercise.name}
                          </span>
                          {hasLogged && (
                            <span className="text-[#f97316] number font-semibold">
                              {topWeight} kg × {todaySets.length}
                            </span>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => setShowExerciseDetail(exercise)}
                        className="btn-icon"
                        title="View progress"
                      >
                        <ChartIcon className="w-5 h-5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Fixed bottom button */}
      {currentSets.length > 0 && (
        <div className="fixed bottom-[72px] left-0 right-0 p-4 bg-gradient-to-t from-black via-black to-transparent">
          <button onClick={handleFinishSession} className="btn-primary w-full">
            Finish Session ({currentSets.length} sets)
          </button>
        </div>
      )}

      {/* Set logging panel */}
      {selectedExercise && (
        <SetLoggingPanel
          exercise={selectedExercise}
          onClose={handleClosePanel}
          onViewProgress={() => {
            setShowExerciseDetail(selectedExercise);
            setSelectedExercise(null);
          }}
        />
      )}

      {/* Manage equipment modal */}
      {showManageEquipment && (
        <ManageEquipment onClose={() => setShowManageEquipment(false)} />
      )}

      {/* Exercise detail modal */}
      {showExerciseDetail && (
        <ExerciseDetail
          exercise={showExerciseDetail}
          onClose={() => setShowExerciseDetail(null)}
        />
      )}

      {/* Session details modal */}
      {showSessionDetails && currentSession && (
        <SessionDetailsModal
          session={currentSession}
          onSave={handleSessionDetailsUpdate}
          onClose={() => setShowSessionDetails(false)}
        />
      )}
    </div>
  );
}
