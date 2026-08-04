import { useState, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabase';
import { formatDate, getTodayDate } from '../utils/date';
import {
  ChevronRightIcon,
  TrashIcon,
  CalendarIcon,
  DumbbellIcon,
  TrophyIcon,
} from '../components/Icons';
import { SessionDetailModal } from '../components/SessionDetailModal';
import type { Session, Set, Exercise } from '../types/database';

interface SessionWithSets extends Session {
  sets: Set[];
}

interface ExerciseHistory {
  exercise: Exercise;
  categoryName: string;
  sessions: {
    date: string;
    sets: Set[];
    topWeight: number;
    totalVolume: number;
  }[];
  bestWeight: number;
  lastPerformed: string;
}

type ViewMode = 'date' | 'exercise';

export function History() {
  const { user, exercises, categories, sessionVersion } = useStore();
  const [sessions, setSessions] = useState<SessionWithSets[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<SessionWithSets | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionWithSets | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('date');
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [fullHistoryExercise, setFullHistoryExercise] = useState<ExerciseHistory | null>(null);

  const loadSessions = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*, sets(*)')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(100);

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions, sessionVersion]);

  const handleDeleteSession = async () => {
    if (!deleteConfirm) return;

    try {
      await supabase.from('sessions').delete().eq('id', deleteConfirm.id);
      setSessions(sessions.filter((s) => s.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  };

  // Build exercise history from sessions
  const exerciseHistories = useMemo((): ExerciseHistory[] => {
    const historyMap = new Map<string, ExerciseHistory>();

    for (const session of sessions) {
      // Include all sessions (including today's completed ones)
      const setsByExercise = new Map<string, Set[]>();
      for (const set of session.sets) {
        const existing = setsByExercise.get(set.exercise_id) || [];
        existing.push(set);
        setsByExercise.set(set.exercise_id, existing);
      }

      for (const [exerciseId, sets] of setsByExercise) {
        const exercise = exercises.find((e) => e.id === exerciseId);
        if (!exercise) continue;

        const category = categories.find((c) => c.id === exercise.category_id);
        const topWeight = Math.max(...sets.map((s) => s.weight));
        const totalVolume = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);

        if (!historyMap.has(exerciseId)) {
          historyMap.set(exerciseId, {
            exercise,
            categoryName: category?.name || 'Unknown',
            sessions: [],
            bestWeight: 0,
            lastPerformed: '',
          });
        }

        const history = historyMap.get(exerciseId)!;
        history.sessions.push({
          date: session.date,
          sets: sets.sort((a, b) => a.set_number - b.set_number),
          topWeight,
          totalVolume,
        });

        if (topWeight > history.bestWeight) {
          history.bestWeight = topWeight;
        }

        if (!history.lastPerformed || session.date > history.lastPerformed) {
          history.lastPerformed = session.date;
        }
      }
    }

    // Sort sessions within each history by date descending
    const histories = Array.from(historyMap.values());
    for (const history of histories) {
      history.sessions.sort((a, b) => b.date.localeCompare(a.date));
    }

    // Sort by last performed (most recent first)
    histories.sort((a, b) => b.lastPerformed.localeCompare(a.lastPerformed));

    return histories;
  }, [sessions, exercises, categories]);

  const getExerciseName = (exerciseId: string) => {
    return exercises.find((e) => e.id === exerciseId)?.name || 'Unknown';
  };

  const getSessionSummary = (session: SessionWithSets) => {
    const exerciseIds = [...new Set(session.sets.map((s) => s.exercise_id))];
    const exerciseNames = exerciseIds.slice(0, 3).map(getExerciseName);
    const remaining = exerciseIds.length - 3;

    let summary = exerciseNames.join(', ');
    if (remaining > 0) {
      summary += ` +${remaining} more`;
    }
    return summary || 'No exercises';
  };

  const getTotalSets = (session: SessionWithSets) => {
    return session.sets.length;
  };

  const getTopWeight = (session: SessionWithSets) => {
    if (session.sets.length === 0) return 0;
    return Math.max(...session.sets.map((s) => s.weight));
  };

  // Get days since last workout
  const getDaysSince = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date(getTodayDate());
    const diffTime = today.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 14) return '1 week ago';
    return `${Math.floor(diffDays / 7)} weeks ago`;
  };

  if (loading) {
    return (
      <div className="page flex items-center justify-center">
        <div className="text-[#737373]">Loading history...</div>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="sticky top-0 bg-black border-b border-[#1a1a1a] p-4 z-10">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-white">History</h1>
            <p className="text-sm text-[#737373]">
              {viewMode === 'date'
                ? `${sessions.length} sessions`
                : `${exerciseHistories.length} exercises tracked`}
            </p>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex bg-[#1a1a1a] rounded-xl p-1">
          <button
            onClick={() => setViewMode('date')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'date'
                ? 'bg-[#f97316] text-white'
                : 'text-[#737373] hover:text-white'
            }`}
          >
            <CalendarIcon className="w-4 h-4" />
            By Date
          </button>
          <button
            onClick={() => setViewMode('exercise')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'exercise'
                ? 'bg-[#f97316] text-white'
                : 'text-[#737373] hover:text-white'
            }`}
          >
            <DumbbellIcon className="w-4 h-4" />
            By Exercise
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {viewMode === 'date' ? (
          // BY DATE VIEW
          sessions.length === 0 ? (
            <div className="empty-state">
              <CalendarIcon className="empty-state-icon" />
              <div className="empty-state-title">No workout history</div>
              <div className="empty-state-text">
                Your completed workouts will appear here
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="card p-4 cursor-pointer hover:border-[#333] transition-colors group"
                  onClick={() => setSelectedSession(session)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-white">
                          {formatDate(session.date)}
                        </h3>
                        {session.body_weight && (
                          <span className="badge badge-orange number">
                            {session.body_weight} kg
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[#737373] mb-2">
                        {getSessionSummary(session)}
                      </p>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-[#a3a3a3]">
                          <span className="text-[#f97316] font-semibold number">
                            {getTotalSets(session)}
                          </span>{' '}
                          sets
                        </span>
                        {getTopWeight(session) > 0 && (
                          <span className="text-[#a3a3a3]">
                            Top:{' '}
                            <span className="text-[#f97316] font-semibold number">
                              {getTopWeight(session)} kg
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm(session);
                        }}
                        className="btn-icon text-[#ef4444] opacity-0 group-hover:opacity-100 hover:opacity-100"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                      <ChevronRightIcon className="w-5 h-5 text-[#525252]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          // BY EXERCISE VIEW
          exerciseHistories.length === 0 ? (
            <div className="empty-state">
              <DumbbellIcon className="empty-state-icon" />
              <div className="empty-state-title">No exercise history</div>
              <div className="empty-state-text">
                Start logging workouts to see your progress per exercise
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {exerciseHistories.map((history) => {
                const isExpanded = expandedExercise === history.exercise.id;
                const recentSessions = history.sessions.slice(0, 5);

                return (
                  <div key={history.exercise.id} className="card overflow-hidden">
                    {/* Exercise Header */}
                    <button
                      onClick={() =>
                        setExpandedExercise(isExpanded ? null : history.exercise.id)
                      }
                      className="w-full p-4 flex items-center justify-between hover:bg-[#1a1a1a] transition-colors"
                    >
                      <div className="text-left">
                        <h3 className="font-semibold text-white">
                          {history.exercise.name}
                        </h3>
                        <p className="text-xs text-[#737373]">
                          {history.categoryName} · {getDaysSince(history.lastPerformed)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-[#f97316]">
                            <TrophyIcon className="w-3 h-3" />
                            <span className="font-semibold number">
                              {history.bestWeight} kg
                            </span>
                          </div>
                          <div className="text-xs text-[#737373]">
                            {history.sessions.length} sessions
                          </div>
                        </div>
                        <ChevronRightIcon
                          className={`w-5 h-5 text-[#525252] transition-transform ${
                            isExpanded ? 'rotate-90' : ''
                          }`}
                        />
                      </div>
                    </button>

                    {/* Expanded History */}
                    {isExpanded && (
                      <div className="border-t border-[#1a1a1a] bg-[#0d0d0d]">
                        {/* Quick Stats */}
                        <div className="p-3 border-b border-[#1a1a1a] flex items-center gap-4">
                          <div className="text-xs text-[#737373]">
                            Last 5 sessions:
                          </div>
                        </div>

                        {/* Session List */}
                        <div className="divide-y divide-[#1a1a1a]">
                          {recentSessions.map((session) => (
                            <div key={session.date} className="p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-medium text-white">
                                  {formatDate(session.date)}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-[#737373]">
                                  <span>
                                    <span className="text-[#f97316] number">
                                      {session.topWeight}
                                    </span>{' '}
                                    kg max
                                  </span>
                                  <span>·</span>
                                  <span>
                                    <span className="text-white number">
                                      {session.sets.length}
                                    </span>{' '}
                                    sets
                                  </span>
                                </div>
                              </div>

                              {/* Sets Display */}
                              <div className="flex flex-wrap gap-1.5">
                                {session.sets.map((set) => (
                                  <div
                                    key={set.id}
                                    className="bg-[#1a1a1a] rounded px-2 py-1 text-xs"
                                  >
                                    <span className="text-white number">
                                      {set.weight}
                                    </span>
                                    <span className="text-[#525252]">kg</span>
                                    <span className="text-[#f97316] ml-1">
                                      ×{set.reps}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        {history.sessions.length > 5 && (
                          <button
                            onClick={() => setFullHistoryExercise(history)}
                            className="w-full p-3 text-center text-xs text-[#f97316] hover:bg-[#1a1a1a] transition-colors font-medium"
                          >
                            View all {history.sessions.length} sessions →
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Session Detail Modal */}
      {selectedSession && (
        <SessionDetailModal
          session={selectedSession}
          exercises={exercises}
          categories={categories}
          onClose={() => setSelectedSession(null)}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div
            className="modal-content max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 space-y-4">
              <h3 className="text-lg font-semibold text-white">Delete Session?</h3>
              <p className="text-[#a3a3a3]">
                This will permanently delete the session from{' '}
                <strong className="text-white">
                  {formatDate(deleteConfirm.date)}
                </strong>{' '}
                with{' '}
                <strong className="text-[#ef4444]">
                  {deleteConfirm.sets.length} sets
                </strong>
                .
              </p>
              <div className="flex gap-2">
                <button onClick={handleDeleteSession} className="btn-danger flex-1">
                  Delete
                </button>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Exercise History Modal */}
      {fullHistoryExercise && (
        <div className="modal-backdrop" onClick={() => setFullHistoryExercise(null)}>
          <div
            className="modal-content-flex"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#1a1a1a]">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {fullHistoryExercise.exercise.name}
                </h2>
                <p className="text-sm text-[#737373]">
                  {fullHistoryExercise.categoryName} · {fullHistoryExercise.sessions.length} sessions
                </p>
              </div>
              <button
                onClick={() => setFullHistoryExercise(null)}
                className="btn-icon"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Stats Summary */}
            <div className="p-4 border-b border-[#1a1a1a] bg-[#0d0d0d]">
              <div className="flex items-center justify-around">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-[#f97316]">
                    <TrophyIcon className="w-4 h-4" />
                    <span className="text-xl font-bold number">{fullHistoryExercise.bestWeight}</span>
                    <span className="text-sm">kg</span>
                  </div>
                  <div className="text-xs text-[#737373]">Personal Best</div>
                </div>
                <div className="w-px h-8 bg-[#1a1a1a]" />
                <div className="text-center">
                  <div className="text-xl font-bold text-white number">
                    {fullHistoryExercise.sessions.length}
                  </div>
                  <div className="text-xs text-[#737373]">Total Sessions</div>
                </div>
                <div className="w-px h-8 bg-[#1a1a1a]" />
                <div className="text-center">
                  <div className="text-xl font-bold text-white number">
                    {fullHistoryExercise.sessions.reduce((sum, s) => sum + s.sets.length, 0)}
                  </div>
                  <div className="text-xs text-[#737373]">Total Sets</div>
                </div>
              </div>
            </div>

            {/* All Sessions List */}
            <div className="modal-body divide-y divide-[#1a1a1a]">
              {fullHistoryExercise.sessions.map((session, index) => (
                <div key={session.date} className="py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#1a1a1a] flex items-center justify-center text-xs font-medium text-[#737373]">
                        {index + 1}
                      </span>
                      <span className="text-sm font-medium text-white">
                        {formatDate(session.date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#737373]">
                      <span>
                        <span className="text-[#f97316] number">{session.topWeight}</span> kg max
                      </span>
                      <span>·</span>
                      <span>
                        <span className="text-white number">{session.sets.length}</span> sets
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 ml-8">
                    {session.sets.map((set) => (
                      <div
                        key={set.id}
                        className="bg-[#1a1a1a] rounded px-2 py-1 text-xs"
                      >
                        <span className="text-white number">{set.weight}</span>
                        <span className="text-[#525252]">kg</span>
                        <span className="text-[#f97316] ml-1">×{set.reps}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="modal-footer">
              <button
                onClick={() => setFullHistoryExercise(null)}
                className="btn-secondary w-full"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
