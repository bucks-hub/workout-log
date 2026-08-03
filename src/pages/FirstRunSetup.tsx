import { useState } from 'react';
import { useStore } from '../store/useStore';
import { createCategory } from '../lib/sync';
import { DumbbellIcon, CheckIcon } from '../components/Icons';

const STARTER_CATEGORIES = [
  { name: 'Legs', emoji: '🦵' },
  { name: 'Chest', emoji: '💪' },
  { name: 'Back', emoji: '🔙' },
  { name: 'Shoulders', emoji: '🎯' },
  { name: 'Arms', emoji: '💪' },
  { name: 'Core', emoji: '🔥' },
];

interface FirstRunSetupProps {
  onComplete: () => void;
}

export function FirstRunSetup({ onComplete }: FirstRunSetupProps) {
  const { user, addCategory } = useStore();
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    STARTER_CATEGORIES.map((c) => c.name)
  );
  const [isCreating, setIsCreating] = useState(false);

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const handleAccept = async () => {
    if (!user) return;

    setIsCreating(true);
    try {
      // Create selected categories
      for (let i = 0; i < selectedCategories.length; i++) {
        const category = await createCategory(
          user.id,
          selectedCategories[i],
          i
        );
        addCategory(category);
      }

      onComplete();
    } catch (error) {
      console.error('Error creating categories:', error);
      setIsCreating(false);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-black">
      <div className="max-w-sm w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#f97316] flex items-center justify-center mx-auto mb-4">
            <DumbbellIcon className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Let's get started
          </h1>
          <p className="text-[#737373]">
            Select muscle groups to organize your exercises
          </p>
        </div>

        {/* Category Selection */}
        <div className="space-y-3">
          {STARTER_CATEGORIES.map((category) => {
            const isSelected = selectedCategories.includes(category.name);
            return (
              <button
                key={category.name}
                onClick={() => toggleCategory(category.name)}
                className={`w-full p-4 rounded-xl border-2 transition-all flex items-center justify-between ${
                  isSelected
                    ? 'border-[#f97316] bg-[#f97316]/10'
                    : 'border-[#262626] bg-[#0a0a0a] hover:border-[#333]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{category.emoji}</span>
                  <span className={`font-medium ${isSelected ? 'text-white' : 'text-[#a3a3a3]'}`}>
                    {category.name}
                  </span>
                </div>
                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-[#f97316] flex items-center justify-center">
                    <CheckIcon className="w-4 h-4 text-black" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-2">
          <button
            onClick={handleAccept}
            disabled={selectedCategories.length === 0 || isCreating}
            className="btn-primary w-full py-4 text-base"
          >
            {isCreating ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Creating...
              </span>
            ) : (
              `Continue with ${selectedCategories.length} categories`
            )}
          </button>

          <button
            onClick={handleSkip}
            className="w-full py-3 text-[#737373] hover:text-white transition-colors"
          >
            Skip for now
          </button>
        </div>

        <p className="text-xs text-[#525252] text-center">
          You can add or remove categories anytime in settings
        </p>
      </div>
    </div>
  );
}
