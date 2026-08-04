import { useState } from 'react';
import { useStore } from '../store/useStore';
import { createCategory, createExercise, syncToServer } from '../lib/sync';
import { supabase } from '../lib/supabase';
import { addToSyncQueue, saveLocalCategory, saveLocalExercise } from '../lib/db';
import { CloseIcon, PlusIcon, EditIcon, TrashIcon } from '../components/Icons';
import type { Category, Exercise } from '../types/database';

interface ManageEquipmentProps {
  onClose: () => void;
}

export function ManageEquipment({ onClose }: ManageEquipmentProps) {
  const { user, categories, exercises, addCategory, addExercise, updateCategory, updateExercise, deleteCategory, deleteExercise } = useStore();
  const [activeTab, setActiveTab] = useState<'categories' | 'exercises'>('categories');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{type: 'category' | 'exercise', item: Category | Exercise, count: number} | null>(null);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newExerciseName, setNewExerciseName] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [editName, setEditName] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');

  const handleAddCategory = async () => {
    if (!user || !newCategoryName.trim()) return;

    try {
      const category = await createCategory(user.id, newCategoryName.trim(), categories.length);
      addCategory(category);
      setNewCategoryName('');
      setShowAddCategory(false);
    } catch (error) {
      console.error('Error creating category:', error);
      alert('Failed to create category. Name might already exist.');
    }
  };

  const handleAddExercise = async () => {
    if (!user || !newExerciseName.trim() || !selectedCategoryId) return;

    try {
      const categoryExercises = exercises.filter((ex) => ex.category_id === selectedCategoryId);
      const exercise = await createExercise(user.id, selectedCategoryId, newExerciseName.trim(), categoryExercises.length);
      addExercise(exercise);
      setNewExerciseName('');
      setShowAddExercise(false);
    } catch (error) {
      console.error('Error creating exercise:', error);
      alert('Failed to create exercise. Name might already exist.');
    }
  };

  const handleEditCategory = async () => {
    if (!editingCategory || !editName.trim()) return;

    const updated = { ...editingCategory, name: editName.trim() };
    updateCategory(editingCategory.id, { name: editName.trim() });
    await saveLocalCategory(updated);
    await addToSyncQueue({ action: 'update', table: 'categories', payload: updated });
    setEditingCategory(null);

    // Immediately sync to server
    syncToServer().catch(console.error);
  };

  const handleEditExercise = async () => {
    if (!editingExercise || !editName.trim()) return;

    const updated = {
      ...editingExercise,
      name: editName.trim(),
      category_id: editCategoryId || editingExercise.category_id
    };
    updateExercise(editingExercise.id, { name: editName.trim(), category_id: updated.category_id });
    await saveLocalExercise(updated);
    await addToSyncQueue({ action: 'update', table: 'exercises', payload: updated });
    setEditingExercise(null);

    // Immediately sync to server
    syncToServer().catch(console.error);
  };

  const handleDeleteCategory = async (category: Category) => {
    const exerciseCount = exercises.filter((ex) => ex.category_id === category.id).length;

    // Get set count for all exercises in this category
    let setCount = 0;
    if (user) {
      const categoryExerciseIds = exercises.filter((ex) => ex.category_id === category.id).map((ex) => ex.id);
      if (categoryExerciseIds.length > 0) {
        const { count } = await supabase
          .from('sets')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .in('exercise_id', categoryExerciseIds);
        setCount = count || 0;
      }
    }

    setDeleteConfirm({
      type: 'category',
      item: category,
      count: exerciseCount + setCount
    });
  };

  const handleDeleteExercise = async (exercise: Exercise) => {
    let setCount = 0;
    if (user) {
      const { count } = await supabase
        .from('sets')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('exercise_id', exercise.id);
      setCount = count || 0;
    }

    setDeleteConfirm({
      type: 'exercise',
      item: exercise,
      count: setCount
    });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm || !user) return;

    if (deleteConfirm.type === 'category') {
      const category = deleteConfirm.item as Category;

      // Delete from server (cascades to exercises and sets)
      await supabase.from('categories').delete().eq('id', category.id);

      // Delete locally
      const categoryExercises = exercises.filter((ex) => ex.category_id === category.id);
      categoryExercises.forEach((ex) => deleteExercise(ex.id));
      deleteCategory(category.id);

      await addToSyncQueue({ action: 'delete', table: 'categories', payload: category });
    } else {
      const exercise = deleteConfirm.item as Exercise;

      // Delete from server (cascades to sets)
      await supabase.from('exercises').delete().eq('id', exercise.id);

      // Delete locally
      deleteExercise(exercise.id);

      await addToSyncQueue({ action: 'delete', table: 'exercises', payload: exercise });
    }

    setDeleteConfirm(null);

    // Sync to ensure consistency (deletions already done via Supabase, but sync queue cleanup)
    syncToServer().catch(console.error);
  };

  const getCategoryExercises = (categoryId: string) => {
    return exercises
      .filter((ex) => ex.category_id === categoryId)
      .sort((a, b) => a.sort_order - b.sort_order);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content-flex max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1a1a1a] flex-shrink-0">
          <h2 className="text-lg font-semibold text-white">Manage Equipment</h2>
          <button onClick={onClose} className="btn-icon">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#1a1a1a] flex-shrink-0">
          <button
            onClick={() => setActiveTab('categories')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'categories'
                ? 'text-[#f97316] border-b-2 border-[#f97316]'
                : 'text-[#737373] hover:text-[#a3a3a3]'
            }`}
          >
            Categories
          </button>
          <button
            onClick={() => setActiveTab('exercises')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'exercises'
                ? 'text-[#f97316] border-b-2 border-[#f97316]'
                : 'text-[#737373] hover:text-[#a3a3a3]'
            }`}
          >
            Exercises
          </button>
        </div>

        {/* Content - scrollable body */}
        <div className="modal-body space-y-4">
          {activeTab === 'categories' ? (
            <>
              {categories.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-title">No categories yet</div>
                  <div className="empty-state-text">Create muscle group categories to organize your exercises</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {categories
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((category) => (
                      <div key={category.id} className="flex items-center gap-2">
                        <div className="flex-1 p-4 bg-[#0a0a0a] rounded-xl border border-[#1a1a1a]">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="font-medium text-white">{category.name}</h3>
                              <p className="text-sm text-[#737373]">
                                {getCategoryExercises(category.id).length} exercises
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setEditingCategory(category);
                                  setEditName(category.name);
                                }}
                                className="btn-icon"
                              >
                                <EditIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteCategory(category)}
                                className="btn-icon text-[#ef4444]"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}

            </>
          ) : (
            <>
              {categories.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-title">No categories yet</div>
                  <div className="empty-state-text">Create categories first, then add exercises to them</div>
                </div>
              ) : (
                <div className="space-y-6">
                  {categories
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((category) => {
                      const categoryExercises = getCategoryExercises(category.id);
                      return (
                        <div key={category.id} className="space-y-2">
                          <h3 className="text-xs font-semibold text-[#737373] uppercase tracking-wider px-1">
                            {category.name}
                          </h3>
                          {categoryExercises.length === 0 ? (
                            <p className="text-sm text-[#525252] italic px-1">No exercises yet</p>
                          ) : (
                            categoryExercises.map((exercise) => (
                              <div key={exercise.id} className="flex items-center gap-2">
                                <div className="flex-1 p-3 bg-[#0a0a0a] rounded-xl border border-[#1a1a1a] flex items-center justify-between">
                                  <span className="text-white">{exercise.name}</span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => {
                                        setEditingExercise(exercise);
                                        setEditName(exercise.name);
                                        setEditCategoryId(exercise.category_id);
                                      }}
                                      className="btn-icon"
                                    >
                                      <EditIcon className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteExercise(exercise)}
                                      className="btn-icon text-[#ef4444]"
                                    >
                                      <TrashIcon className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

            </>
          )}
        </div>

        {/* Fixed Footer with Add buttons */}
        <div className="modal-footer">
          {activeTab === 'categories' ? (
            showAddCategory ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Category name (e.g., Legs)"
                  className="input"
                  autoFocus
                  onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
                />
                <div className="flex gap-2">
                  <button onClick={handleAddCategory} disabled={!newCategoryName.trim()} className="btn-primary flex-1">
                    Add
                  </button>
                  <button onClick={() => { setShowAddCategory(false); setNewCategoryName(''); }} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddCategory(true)} className="btn-primary w-full">
                <PlusIcon className="w-5 h-5" />
                Add Category
              </button>
            )
          ) : (
            showAddExercise ? (
              <div className="space-y-3">
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="input"
                >
                  <option value="">Select category...</option>
                  {categories.sort((a, b) => a.sort_order - b.sort_order).map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newExerciseName}
                  onChange={(e) => setNewExerciseName(e.target.value)}
                  placeholder="Exercise name (e.g., Bench Press)"
                  className="input"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddExercise()}
                />
                <div className="flex gap-2">
                  <button onClick={handleAddExercise} disabled={!newExerciseName.trim() || !selectedCategoryId} className="btn-primary flex-1">
                    Add
                  </button>
                  <button onClick={() => { setShowAddExercise(false); setNewExerciseName(''); setSelectedCategoryId(''); }} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddExercise(true)} disabled={categories.length === 0} className="btn-primary w-full">
                <PlusIcon className="w-5 h-5" />
                Add Exercise
              </button>
            )
          )}
        </div>

        {/* Edit Category Modal */}
        {editingCategory && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-[#0a0a0a] rounded-2xl p-4 w-full max-w-sm space-y-4">
              <h3 className="text-lg font-semibold text-white">Edit Category</h3>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="input"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={handleEditCategory} disabled={!editName.trim()} className="btn-primary flex-1">
                  Save
                </button>
                <button onClick={() => setEditingCategory(null)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Exercise Modal */}
        {editingExercise && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-[#0a0a0a] rounded-2xl p-4 w-full max-w-sm space-y-4">
              <h3 className="text-lg font-semibold text-white">Edit Exercise</h3>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Exercise name"
                className="input"
                autoFocus
              />
              <select
                value={editCategoryId}
                onChange={(e) => setEditCategoryId(e.target.value)}
                className="input"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button onClick={handleEditExercise} disabled={!editName.trim()} className="btn-primary flex-1">
                  Save
                </button>
                <button onClick={() => setEditingExercise(null)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        {deleteConfirm && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-[#0a0a0a] rounded-2xl p-4 w-full max-w-sm space-y-4">
              <h3 className="text-lg font-semibold text-white">Delete {deleteConfirm.type}?</h3>
              <p className="text-[#a3a3a3]">
                This will permanently delete <strong className="text-white">"{(deleteConfirm.item as any).name}"</strong>
                {deleteConfirm.count > 0 && (
                  <> and <strong className="text-[#ef4444]">{deleteConfirm.count} related items</strong></>
                )}.
              </p>
              <div className="flex gap-2">
                <button onClick={confirmDelete} className="btn-danger flex-1">
                  Delete
                </button>
                <button onClick={() => setDeleteConfirm(null)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
