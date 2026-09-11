/** Shape of the .wld JSON file exported from BenchTracker */

export type WldFile = {
  version: number;
  user: unknown;
  settings: unknown;
  typeList: {
    list: WldExerciseType[];
  };
  workouts: WldWorkout[];
  achievements?: unknown;
  templateList?: unknown;
};

export type WldExerciseType = {
  name: string;
  category: string;
  style: string;
  iterations: string[];
  favorite: boolean;
  hidden: boolean;
};

export type WldWorkout = {
  uuid: string;
  name: string;
  date: string; // "YYYY-MM-DD HH:mm", in the phone's time zone at export
  dateModified: boolean;
  duration: number; // seconds
  supersets: string[]; // e.g. ["0 1", "2 3"]
  exercises: WldExercise[];
};

export type WldExercise = {
  name: string;
  category: string;
  style: string;
  iteration?: string | null;
  sets: WldSet[];
};

export type WldSet = {
  reps?: number;
  weight?: number;
  volume?: number;
  oneRM?: number;
  duration?: number; // seconds
  distance?: number;
  calories?: number;
  custom?: number | string;
};
