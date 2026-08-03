import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabase';
import { formatDate } from '../utils/date';
import { ChevronRightIcon, TrashIcon, CalendarIcon } from '../components/Icons';
import type { Session, Set } from '../types/database';

interface SessionWithSets extends Session {
  sets: Set[];
}

interface HistoryProps {
  onViewSession?: (session: SessionWithSets) => void;
}

export function History({ onViewSession }: HistoryProps) {
  const { user, exercises } = useStore();
  const [sessions, setSessions] = useState<SessionWithSets[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<SessionWithSets | null>(null);

  useEffect(() => {
    loadSessions();
  }, [user]);

  const loadSessions = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*, sets(*)')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(50);

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  };

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
        <h1 className="text-2xl font-bold text-white">History</h1>
        <p className="text-sm text-[#737373]">{sessions.length} sessions</p>
      </div>

      {/* Sessions List */}
      <div className="p-4">
        {sessions.length === 0 ? (
          <div className="empty-state">
            <CalendarIcon className="empty-state-icon" />
            <div className="empty-state-title">No workout history</div>
            <div className="empty-state-text">Your completed workouts will appear here</div>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="card p-4 cursor-pointer hover:border-[#333] transition-colors"
                onClick={() => onViewSession?.(session)}
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
                        <span className="text-[#f97316] font-semibold number">{getTotalSets(session)}</span> sets
                      </span>
                      {getTopWeight(session) > 0 && (
                        <span className="text-[#a3a3a3]">
                          Top: <span className="text-[#f97316] font-semibold number">{getTopWeight(session)} kg</span>
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
        )}
      </div>

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-content max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 space-y-4">
              <h3 className="text-lg font-semibold text-white">Delete Session?</h3>
              <p className="text-[#a3a3a3]">
                This will permanently delete the session from <strong className="text-white">{formatDate(deleteConfirm.date)}</strong> with <strong className="text-[#ef4444]">{deleteConfirm.sets.length} sets</strong>.
              </p>
              <div className="flex gap-2">
                <button onClick={handleDeleteSession} className="btn-danger flex-1">
                  Delete
                </button>
                <button onClick={() => setDeleteConfirm(null)} className="btn-secondary flex-1">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
