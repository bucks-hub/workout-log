import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabase';
import { formatDate } from '../utils/date';
import { ChevronLeftIcon, TrophyIcon, FireIcon } from '../components/Icons';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { Exercise, Set, Session } from '../types/database';

interface ExerciseDetailProps {
  exercise: Exercise;
  onClose: () => void;
}

interface SetWithSession extends Set {
  session?: Session;
}

interface ChartDataPoint {
  date: string;
  weight: number;
  reps: number;
  volume: number;
}

export function ExerciseDetail({ exercise, onClose }: ExerciseDetailProps) {
  const { user } = useStore();
  const [sets, setSets] = useState<SetWithSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);

  useEffect(() => {
    loadExerciseHistory();
  }, [exercise.id, user]);

  const loadExerciseHistory = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Load all sets for this exercise with session data
      const { data: setsData, error } = await supabase
        .from('sets')
        .select('*, sessions(*)')
        .eq('exercise_id', exercise.id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const setsWithSessions = (setsData || []).map((s: any) => ({
        ...s,
        session: s.sessions,
      }));

      setSets(setsWithSessions);

      // Build chart data (group by session date, take max weight)
      const sessionMap = new Map<string, { weight: number; reps: number; volume: number }>();

      for (const set of setsWithSessions) {
        if (set.session?.date) {
          const existing = sessionMap.get(set.session.date);
          const volume = set.weight * set.reps;

          if (!existing || set.weight > existing.weight) {
            sessionMap.set(set.session.date, {
              weight: set.weight,
              reps: set.reps,
              volume: existing ? existing.volume + volume : volume,
            });
          } else if (existing) {
            existing.volume += volume;
          }
        }
      }

      const chartPoints: ChartDataPoint[] = Array.from(sessionMap.entries())
        .map(([date, data]) => ({
          date,
          ...data,
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-20); // Last 20 sessions

      setChartData(chartPoints);
    } catch (error) {
      console.error('Error loading exercise history:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate best sets
  const getBestWeight = () => {
    if (sets.length === 0) return null;
    const best = sets.reduce((max, set) => (set.weight > max.weight ? set : max));
    return { weight: best.weight, reps: best.reps };
  };

  const getBestVolume = () => {
    if (sets.length === 0) return null;
    const best = sets.reduce((max, set) => {
      const volume = set.weight * set.reps;
      const maxVolume = max.weight * max.reps;
      return volume > maxVolume ? set : max;
    });
    return { weight: best.weight, reps: best.reps, volume: best.weight * best.reps };
  };

  const getTotalSets = () => sets.length;
  const getTotalVolume = () => sets.reduce((sum, s) => sum + s.weight * s.reps, 0);

  const bestWeight = getBestWeight();
  const bestVolume = getBestVolume();

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
        <div className="text-[#737373]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-black border-b border-[#1a1a1a] p-4 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="btn-icon">
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">{exercise.name}</h1>
            <p className="text-sm text-[#737373]">Progress & History</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sets.length === 0 ? (
          <div className="empty-state mt-12">
            <FireIcon className="empty-state-icon" />
            <div className="empty-state-title">No history yet</div>
            <div className="empty-state-text">Start logging sets to see your progress</div>
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="card p-4">
                <div className="flex items-center gap-2 text-[#f97316] mb-2">
                  <TrophyIcon className="w-4 h-4" />
                  <span className="text-xs font-medium uppercase">Best Weight</span>
                </div>
                {bestWeight && (
                  <div>
                    <span className="text-2xl font-bold text-white number">{bestWeight.weight}</span>
                    <span className="text-[#737373] ml-1">kg</span>
                    <span className="text-sm text-[#525252] ml-2">× {bestWeight.reps}</span>
                  </div>
                )}
              </div>

              <div className="card p-4">
                <div className="flex items-center gap-2 text-[#f97316] mb-2">
                  <FireIcon className="w-4 h-4" />
                  <span className="text-xs font-medium uppercase">Best Volume</span>
                </div>
                {bestVolume && (
                  <div>
                    <span className="text-2xl font-bold text-white number">{bestVolume.volume.toLocaleString()}</span>
                    <span className="text-[#737373] ml-1">kg</span>
                  </div>
                )}
              </div>

              <div className="card p-4">
                <div className="text-xs font-medium uppercase text-[#737373] mb-2">Total Sets</div>
                <span className="text-2xl font-bold text-white number">{getTotalSets()}</span>
              </div>

              <div className="card p-4">
                <div className="text-xs font-medium uppercase text-[#737373] mb-2">Total Volume</div>
                <span className="text-2xl font-bold text-white number">{getTotalVolume().toLocaleString()}</span>
                <span className="text-[#737373] ml-1">kg</span>
              </div>
            </div>

            {/* Progress Chart */}
            {chartData.length > 1 && (
              <div className="card p-4">
                <h3 className="text-sm font-medium text-[#a3a3a3] mb-4">Weight Progress</h3>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis
                        dataKey="date"
                        tick={{ fill: '#525252', fontSize: 10 }}
                        tickLine={false}
                        axisLine={{ stroke: '#262626' }}
                        tickFormatter={(date) => {
                          const d = new Date(date);
                          return `${d.getDate()}/${d.getMonth() + 1}`;
                        }}
                      />
                      <YAxis
                        tick={{ fill: '#525252', fontSize: 10 }}
                        tickLine={false}
                        axisLine={{ stroke: '#262626' }}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1a1a1a',
                          border: '1px solid #262626',
                          borderRadius: '8px',
                          color: '#e5e5e5',
                        }}
                        labelFormatter={(date) => formatDate(date as string)}
                        formatter={(value) => [`${value} kg`, 'Weight']}
                      />
                      <Line
                        type="monotone"
                        dataKey="weight"
                        stroke="#f97316"
                        strokeWidth={2}
                        dot={{ fill: '#f97316', strokeWidth: 0, r: 4 }}
                        activeDot={{ r: 6, fill: '#f97316' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Recent History */}
            <div>
              <h3 className="text-sm font-medium text-[#a3a3a3] mb-3">Recent Sessions</h3>
              <div className="space-y-2">
                {Array.from(new Set(sets.map((s) => s.session?.date)))
                  .filter(Boolean)
                  .slice(0, 10)
                  .map((date) => {
                    const sessionSets = sets.filter((s) => s.session?.date === date);
                    const maxWeight = Math.max(...sessionSets.map((s) => s.weight));
                    const totalSets = sessionSets.length;

                    return (
                      <div key={date} className="card p-3 flex items-center justify-between">
                        <div>
                          <div className="text-white font-medium">{formatDate(date!)}</div>
                          <div className="text-sm text-[#737373]">
                            {sessionSets.map((s) => `${s.weight}×${s.reps}`).join(', ')}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[#f97316] font-semibold number">{maxWeight} kg</div>
                          <div className="text-xs text-[#737373]">{totalSets} sets</div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
