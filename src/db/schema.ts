import { pgTable, serial, text, real, integer, date, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';

export const profile = pgTable('profile', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().default(''),
  weightKg: real('weight_kg').notNull(),
  heightCm: real('height_cm').notNull(),
  age: integer('age').notNull(),
  gender: text('gender', { enum: ['male', 'female'] }).notNull(),
  goal: text('goal', { enum: ['fat_loss', 'maintain', 'muscle_gain'] }).notNull(),
  gymDaysPerWeek: integer('gym_days_per_week').notNull(),
  experience: text('experience', { enum: ['beginner', 'intermediate', 'advanced'] }).notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const targets = pgTable('targets', {
  id: serial('id').primaryKey(),
  effectiveFrom: date('effective_from').notNull(),
  calculated: jsonb('calculated').notNull(),
  overrides: jsonb('overrides').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const weightLog = pgTable('weight_log', {
  date: date('date').primaryKey(),
  weightKg: real('weight_kg').notNull(),
});

export const foodItems = pgTable('food_items', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  portionLabel: text('portion_label').notNull(),
  kcal: real('kcal').notNull(),
  protein: real('protein').notNull(),
  carbs: real('carbs').notNull(),
  fat: real('fat').notNull(),
  isCustom: boolean('is_custom').notNull().default(false),
  isFavorite: boolean('is_favorite').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const diaryEntries = pgTable('diary_entries', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  mealSlot: text('meal_slot', { enum: ['breakfast', 'lunch', 'dinner', 'snacks'] }).notNull(),
  foodItemId: integer('food_item_id').references(() => foodItems.id),
  name: text('name').notNull(),
  portionMultiplier: real('portion_multiplier').notNull().default(1),
  calories: real('calories').notNull(),
  protein: real('protein').notNull(),
  carbs: real('carbs').notNull(),
  fat: real('fat').notNull(),
  loggedAt: timestamp('logged_at').notNull().defaultNow(),
});

export const dayLog = pgTable('day_log', {
  date: date('date').primaryKey(),
  waterL: real('water_l').notNull().default(0),
  isGymDay: boolean('is_gym_day').notNull().default(true),
});

export const routines = pgTable('routines', {
  id: serial('id').primaryKey(),
  goal: text('goal', { enum: ['fat_loss', 'maintain', 'muscle_gain'] }).notNull(),
  daysPerWeek: integer('days_per_week').notNull(),
  experience: text('experience', { enum: ['beginner', 'intermediate', 'advanced'] }).notNull(),
  days: jsonb('days').notNull(),
  currentDayIndex: integer('current_day_index').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const workoutSessions = pgTable('workout_sessions', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  routineDayLabel: text('routine_day_label').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const setLogs = pgTable('set_logs', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').notNull().references(() => workoutSessions.id),
  exerciseName: text('exercise_name').notNull(),
  setNumber: integer('set_number').notNull(),
  reps: integer('reps').notNull(),
  weightKg: real('weight_kg').notNull(),
});
