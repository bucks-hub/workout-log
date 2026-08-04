import { useEffect, useState, useMemo } from 'react';
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
import { PlusIcon, ScaleIcon, ChartIcon, CheckIcon } from '../components/Icons';
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
    incrementSessionVersion,
  } = useStore();

  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [showManageEquipment, setShowManageEquipment] = useState(false);
  const [showExerciseDetail, setShowExerciseDetail] = useState<Exercise | null>(null);
  const [showSessionDetails, setShowSessionDetails] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Calculate weekly progress
  const [weeklyProgress, setWeeklyProgress] = useState({ completed: 0, goal: 5 });

  useEffect(() => {
    const loadWeeklyProgress = async () => {
      if (!user) return;

      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      const startDate = startOfWeek.toISOString().split('T')[0];

      const { data } = await supabase
        .from('sessions')
        .select('id')
        .eq('user_id', user.id)
        .gte('date', startDate);

      setWeeklyProgress({ completed: data?.length || 0, goal: 5 });
    };

    loadWeeklyProgress();
  }, [user, sessionCompleted]);

  useEffect(() => {
    const initSession = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      // If session is completed, don't reinitialize
      if (sessionCompleted) {
        setIsLoading(false);
        return;
      }

      // If we already have a session, don't reload
      if (currentSession) {
        setIsLoading(false);
        return;
      }

      const todayDate = getTodayDate();

      // Check for existing session
      let existingSession = await getLocalSessionByDate(todayDate);

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
        setCurrentSession(existingSession);

        const localSets = await getLocalSetsBySession(existingSession.id);
        if (localSets.length > 0) {
          setCurrentSets(localSets);
        } else {
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
        await upsertSession(session);
        syncToServer().catch(console.error);
      }

      setIsLoading(false);
    };

    initSession();
  }, [user, currentSession, sessionCompleted, setCurrentSession, setCurrentSets]);

  // Group exercises by category
  const exercisesByCategory = useMemo(() =>
    categories
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((category) => ({
        category,
        exercises: exercises
          .filter((ex) => ex.category_id === category.id)
          .sort((a, b) => a.sort_order - b.sort_order),
      }))
      .filter((group) => group.exercises.length > 0),
    [categories, exercises]
  );

  // Get today's sets for each exercise
  const getTodaySets = (exerciseId: string) => {
    if (sessionCompleted) return []; // Don't show highlights after completing
    return currentSets.filter((set) => set.exercise_id === exerciseId);
  };

  const handleExerciseClick = (exercise: Exercise) => {
    // If session was completed, start fresh
    if (sessionCompleted) {
      setSessionCompleted(false);
    }
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
    if (!currentSession || currentSets.length === 0 || isFinishing) return;

    setIsFinishing(true);

    try {
      await upsertSession(currentSession);
      await syncToServer();
      incrementSessionVersion();

      // Mark session as completed - this hides the button and highlights
      setSessionCompleted(true);
      setIsFinishing(false);
    } catch (error) {
      console.error('Error finishing session:', error);
      setIsFinishing(false);
    }
  };

  const handleStartNewWorkout = () => {
    setSessionCompleted(false);
    // The useEffect will handle creating/loading a session
  };

  const totalSetsToday = sessionCompleted ? 0 : currentSets.length;
  const topWeightToday = !sessionCompleted && currentSets.length > 0
    ? Math.max(...currentSets.map((s) => s.weight))
    : 0;

  // Weekly progress ring calculations
  const progressPercent = Math.min((weeklyProgress.completed / weeklyProgress.goal) * 100, 100);

  if (!user) return null;

  return (
    <div className="page bg-black min-h-screen">
      {/* Header with Weekly Progress */}
      <div className="sticky top-0 bg-black/95 backdrop-blur-sm border-b border-[#1a1a1a] z-10">
        <div className="p-4">
          <div className="flex items-center justify-between">
            {/* Date and Stats */}
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {formatDate(getTodayDate())}
              </h1>
              <p className="text-sm text-[#737373] mt-0.5">
                {sessionCompleted ? (
                  <span className="text-[#22c55e] flex items-center gap-1">
                    <CheckIcon className="w-4 h-4" />
                    Workout completed
                  </span>
                ) : totalSetsToday > 0 ? (
                  <span>
                    <span className="text-[#FF6600] font-semibold number">{totalSetsToday}</span> sets logged
                    {topWeightToday > 0 && (
                      <> · Top <span className="text-[#FF6600] font-semibold number">{topWeightToday}</span> kg</>
                    )}
                  </span>
                ) : (
                  "Ready to workout"
                )}
              </p>
            </div>

            {/* Weekly Progress Ring */}
            <div className="relative w-16 h-16 flex items-center justify-center">
              <svg className="w-16 h-16 transform -rotate-90">
                {/* Background circle */}
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  fill="none"
                  stroke="#1a1a1a"
                  strokeWidth="4"
                />
                {/* Progress circle */}
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  fill="none"
                  stroke="#FF6600"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 26}
                  strokeDashoffset={2 * Math.PI * 26 - (progressPercent / 100) * 2 * Math.PI * 26}
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-sm font-bold text-white number">{weeklyProgress.completed}</span>
                <span className="text-[10px] text-[#737373]">/{weeklyProgress.goal}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 ml-3">
              {pendingSyncCount > 0 && (
                <div className="w-2 h-2 bg-[#FF6600] rounded-full animate-pulse" title={`${pendingSyncCount} pending`} />
              )}
              <button
                onClick={() => setShowSessionDetails(true)}
                className="p-2.5 rounded-xl hover:bg-[#1a1a1a] active:bg-[#262626] transition-all active:scale-95"
                title="Session details"
              >
                <ScaleIcon className="w-5 h-5 text-[#737373]" />
              </button>
              <button
                onClick={() => setShowManageEquipment(true)}
                className="p-2.5 rounded-xl hover:bg-[#1a1a1a] active:bg-[#262626] transition-all active:scale-95"
                title="Manage equipment"
              >
                <PlusIcon className="w-5 h-5 text-[#737373]" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="p-4 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-24 bg-[#1a1a1a] rounded animate-pulse" />
              <div className="space-y-2">
                <div className="h-14 bg-[#121212] rounded-xl animate-pulse" />
                <div className="h-14 bg-[#121212] rounded-xl animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Session Completed State */}
          {sessionCompleted && (
            <div className="p-4">
              <div className="bg-gradient-to-br from-[#22c55e]/10 to-[#22c55e]/5 border border-[#22c55e]/20 rounded-2xl p-6 text-center">
                <div className="w-16 h-16 bg-[#22c55e]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckIcon className="w-8 h-8 text-[#22c55e]" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Great Workout!</h2>
                <p className="text-[#737373] mb-4">
                  You logged {currentSets.length} sets today
                </p>
                <button
                  onClick={handleStartNewWorkout}
                  className="bg-[#1a1a1a] hover:bg-[#262626] text-white font-medium py-3 px-6 rounded-xl transition-all active:scale-95"
                >
                  Continue Adding Sets
                </button>
              </div>
            </div>
          )}

          {/* Exercise list */}
          <div className="p-4 space-y-6">
            {exercisesByCategory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="w-20 h-20 rounded-full bg-[#121212] flex items-center justify-center mb-6">
                  <PlusIcon className="w-10 h-10 text-[#333]" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">No exercises yet</h2>
                <p className="text-[#737373] text-center mb-6 max-w-xs">
                  Add categories and exercises to start tracking your workouts
                </p>
                <button
                  onClick={() => setShowManageEquipment(true)}
                  className="bg-[#FF6600] hover:bg-[#e55c00] active:bg-[#cc5200] text-black font-semibold py-3 px-6 rounded-xl transition-all active:scale-95 flex items-center gap-2"
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
                            className={`flex-1 p-4 rounded-xl text-left transition-all active:scale-[0.98] ${
                              hasLogged
                                ? 'bg-[#FF6600]/10 border-2 border-[#FF6600]/40'
                                : 'bg-[#121212] border-2 border-transparent hover:border-[#333]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {hasLogged && (
                                  <div className="w-6 h-6 bg-[#FF6600] rounded-full flex items-center justify-center flex-shrink-0">
                                    <CheckIcon className="w-4 h-4 text-black" />
                                  </div>
                                )}
                                <span className={`font-medium ${hasLogged ? 'text-white' : 'text-[#e5e5e5]'}`}>
                                  {exercise.name}
                                </span>
                              </div>
                              {hasLogged && (
                                <span className="text-[#FF6600] font-semibold number text-sm">
                                  {topWeight}kg × {todaySets.length}
                                </span>
                              )}
                            </div>
                          </button>
                          <button
                            onClick={() => setShowExerciseDetail(exercise)}
                            className="p-3 rounded-xl bg-[#121212] hover:bg-[#1a1a1a] active:bg-[#262626] transition-all active:scale-95"
                            title="View progress"
                          >
                            <ChartIcon className="w-5 h-5 text-[#737373]" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Spacer for bottom button */}
          {!sessionCompleted && currentSets.length > 0 && <div className="h-24" />}
        </>
      )}

      {/* Fixed Finish Session Button */}
      {!sessionCompleted && currentSets.length > 0 && (
        <div className="fixed bottom-[72px] left-0 right-0 p-4 bg-gradient-to-t from-black via-black/95 to-transparent pointer-events-none">
          <button
            onClick={handleFinishSession}
            disabled={isFinishing}
            className={`w-full py-4 rounded-2xl font-semibold text-lg transition-all pointer-events-auto active:scale-[0.98] flex items-center justify-center gap-2 ${
              isFinishing
                ? 'bg-[#FF6600]/50 text-black/50'
                : 'bg-[#FF6600] hover:bg-[#e55c00] text-black shadow-lg shadow-[#FF6600]/20'
            }`}
          >
            {isFinishing ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                <CheckIcon className="w-5 h-5" />
                Finish Session ({currentSets.length} sets)
              </>
            )}
          </button>
        </div>
      )}

      {/* Quick Start FAB - shown when no sets logged and session not completed */}
      {!sessionCompleted && currentSets.length === 0 && exercisesByCategory.length > 0 && (
        <button
          onClick={() => {
            // Open first exercise
            const firstExercise = exercisesByCategory[0]?.exercises[0];
            if (firstExercise) {
              setSelectedExercise(firstExercise);
            }
          }}
          className="fixed bottom-[88px] right-4 w-14 h-14 bg-[#FF6600] hover:bg-[#e55c00] rounded-full shadow-lg shadow-[#FF6600]/30 flex items-center justify-center transition-all active:scale-90 hover:scale-105"
          title="Quick start workout"
        >
          <PlusIcon className="w-7 h-7 text-black" />
        </button>
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
