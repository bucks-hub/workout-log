export interface Category {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface Exercise {
  id: string;
  user_id: string;
  category_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD format
  body_weight?: number;
  sleep_hours?: number;
  sleep_quality?: number; // 1-10
  energy?: number; // 1-10
  created_at: string;
}

export interface Set {
  id: string; // client-generated UUID
  user_id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight: number;
  reps: number;
  created_at: string;
}

// Extended types with relations
export interface ExerciseWithCategory extends Exercise {
  category: Category;
}

export interface SetWithExercise extends Set {
  exercise: Exercise;
}

export interface SessionWithSets extends Session {
  sets: SetWithExercise[];
}

// UI helper types
export interface LastPerformance {
  weight: number;
  reps: number;
  sets: number;
  date: string;
}

export interface ExerciseProgress {
  exercise: Exercise;
  lastPerformance?: LastPerformance;
  todaySets: Set[];
}

export interface TodayExercise {
  exerciseId: string;
  topWeight: number;
  setCount: number;
}
