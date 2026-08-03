import { formatDate } from '../utils/date';
import { CloseIcon, ScaleIcon, MoonIcon, BoltIcon } from './Icons';
import type { Session, Set, Exercise, Category } from '../types/database';

interface SessionDetailModalProps {
  session: Session & { sets: Set[] };
  exercises: Exercise[];
  categories: Category[];
  onClose: () => void;
}

interface ExerciseGroup {
  exercise: Exercise;
  category: Category | undefined;
  sets: Set[];
  topWeight: number;
  totalVolume: number;
}

export function SessionDetailModal({
  session,
  exercises,
  categories,
  onClose,
}: SessionDetailModalProps) {
  // Group sets by exercise
  const exerciseGroups: ExerciseGroup[] = [];
  const exerciseMap = new Map<string, Set[]>();

  for (const set of session.sets) {
    const existing = exerciseMap.get(set.exercise_id) || [];
    existing.push(set);
    exerciseMap.set(set.exercise_id, existing);
  }

  for (const [exerciseId, sets] of exerciseMap) {
    const exercise = exercises.find((e) => e.id === exerciseId);
    if (!exercise) continue;

    const category = categories.find((c) => c.id === exercise.category_id);
    const sortedSets = [...sets].sort((a, b) => a.set_number - b.set_number);
    const topWeight = Math.max(...sets.map((s) => s.weight));
    const totalVolume = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);

    exerciseGroups.push({
      exercise,
      category,
      sets: sortedSets,
      topWeight,
      totalVolume,
    });
  }

  // Sort by category order, then exercise order
  exerciseGroups.sort((a, b) => {
    const catOrderA = a.category?.sort_order ?? 999;
    const catOrderB = b.category?.sort_order ?? 999;
    if (catOrderA !== catOrderB) return catOrderA - catOrderB;
    return a.exercise.sort_order - b.exercise.sort_order;
  });

  const totalSets = session.sets.length;
  const totalVolume = session.sets.reduce((sum, s) => sum + s.weight * s.reps, 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content max-w-lg mx-4 max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1a1a1a]">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {formatDate(session.date)}
            </h2>
            <p className="text-sm text-[#737373]">
              {exerciseGroups.length} exercises · {totalSets} sets ·{' '}
              {totalVolume.toLocaleString()} kg volume
            </p>
          </div>
          <button onClick={onClose} className="btn-icon">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Session Metadata */}
        {(session.body_weight || session.sleep_hours || session.energy) && (
          <div className="flex items-center gap-4 px-4 py-3 bg-[#0d0d0d] border-b border-[#1a1a1a]">
            {session.body_weight && (
              <div className="flex items-center gap-1.5 text-sm">
                <ScaleIcon className="w-4 h-4 text-[#f97316]" />
                <span className="text-white number">{session.body_weight}</span>
                <span className="text-[#737373]">kg</span>
              </div>
            )}
            {session.sleep_hours && (
              <div className="flex items-center gap-1.5 text-sm">
                <MoonIcon className="w-4 h-4 text-[#8b5cf6]" />
                <span className="text-white number">{session.sleep_hours}</span>
                <span className="text-[#737373]">hrs</span>
              </div>
            )}
            {session.energy && (
              <div className="flex items-center gap-1.5 text-sm">
                <BoltIcon className="w-4 h-4 text-[#eab308]" />
                <span className="text-white number">{session.energy}</span>
                <span className="text-[#737373]">/10</span>
              </div>
            )}
          </div>
        )}

        {/* Exercise List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {exerciseGroups.map(({ exercise, category, sets, topWeight, totalVolume }) => (
            <div key={exercise.id} className="card p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-white">{exercise.name}</h3>
                  {category && (
                    <p className="text-xs text-[#737373]">{category.name}</p>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[#f97316] font-semibold number">
                    {topWeight} kg
                  </div>
                  <div className="text-xs text-[#737373]">
                    {totalVolume.toLocaleString()} kg vol
                  </div>
                </div>
              </div>

              {/* Sets Grid */}
              <div className="grid grid-cols-3 gap-2">
                {sets.map((set, idx) => (
                  <div
                    key={set.id}
                    className="bg-[#0d0d0d] rounded-lg p-2 text-center"
                  >
                    <div className="text-xs text-[#525252] mb-0.5">
                      Set {idx + 1}
                    </div>
                    <div className="text-white font-medium number">
                      {set.weight}
                      <span className="text-[#737373] text-xs">kg</span>
                    </div>
                    <div className="text-[#f97316] text-sm number">
                      ×{set.reps}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
