import { useState } from 'react';
import { CloseIcon, ScaleIcon, MoonIcon, BoltIcon } from './Icons';
import type { Session } from '../types/database';

interface SessionDetailsModalProps {
  session: Session;
  onSave: (updates: Partial<Session>) => void;
  onClose: () => void;
}

const SLEEP_LABELS: Record<number, string> = {
  10: 'Deep & refreshed',
  9: 'Deep & refreshed',
  8: 'Normal',
  7: 'Normal',
  6: 'Tired',
  5: 'Tired',
  4: 'Poor',
  3: 'Poor',
  2: 'Very bad',
  1: 'Very bad',
};

const ENERGY_LABELS: Record<number, string> = {
  10: 'Strong & motivated',
  9: 'Strong & motivated',
  8: 'Good',
  7: 'Good',
  6: 'Average',
  5: 'Average',
  4: 'Very tired',
  3: 'Very tired',
  2: 'Exhausted',
  1: 'Exhausted',
};

export function SessionDetailsModal({
  session,
  onSave,
  onClose,
}: SessionDetailsModalProps) {
  const [bodyWeight, setBodyWeight] = useState(session.body_weight?.toString() || '');
  const [sleepHours, setSleepHours] = useState(session.sleep_hours?.toString() || '');
  const [sleepQuality, setSleepQuality] = useState<number | null>(session.sleep_quality || null);
  const [energy, setEnergy] = useState<number | null>(session.energy || null);

  const handleSave = () => {
    onSave({
      body_weight: bodyWeight ? parseFloat(bodyWeight) : undefined,
      sleep_hours: sleepHours ? parseFloat(sleepHours) : undefined,
      sleep_quality: sleepQuality || undefined,
      energy: energy || undefined,
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1a1a1a]">
          <h2 className="text-lg font-semibold text-white">Session Details</h2>
          <button onClick={onClose} className="btn-icon">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Body Weight */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-[#a3a3a3]">
              <ScaleIcon className="w-4 h-4" />
              Body Weight (kg)
            </label>
            <input
              type="number"
              step="0.1"
              value={bodyWeight}
              onChange={(e) => setBodyWeight(e.target.value)}
              placeholder="e.g., 75.5"
              className="input"
            />
          </div>

          {/* Sleep Hours */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-[#a3a3a3]">
              <MoonIcon className="w-4 h-4" />
              Sleep (hours)
            </label>
            <input
              type="number"
              step="0.5"
              value={sleepHours}
              onChange={(e) => setSleepHours(e.target.value)}
              placeholder="e.g., 7.5"
              className="input"
            />
          </div>

          {/* Sleep Quality */}
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-[#a3a3a3]">
                <MoonIcon className="w-4 h-4" />
                Sleep Quality
              </span>
              {sleepQuality && (
                <span className="text-sm text-[#f97316]">
                  {SLEEP_LABELS[sleepQuality]}
                </span>
              )}
            </label>
            <div className="flex justify-between gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setSleepQuality(n)}
                  className={`rating-btn ${sleepQuality === n ? 'selected' : ''}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-[#525252]">
              <span>Very bad</span>
              <span>Deep</span>
            </div>
          </div>

          {/* Energy Level */}
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-[#a3a3a3]">
                <BoltIcon className="w-4 h-4" />
                Energy Level
              </span>
              {energy && (
                <span className="text-sm text-[#f97316]">
                  {ENERGY_LABELS[energy]}
                </span>
              )}
            </label>
            <div className="flex justify-between gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setEnergy(n)}
                  className={`rating-btn ${energy === n ? 'selected' : ''}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-[#525252]">
              <span>Exhausted</span>
              <span>Strong</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#1a1a1a]">
          <button onClick={handleSave} className="btn-primary w-full">
            Save Details
          </button>
        </div>
      </div>
    </div>
  );
}
