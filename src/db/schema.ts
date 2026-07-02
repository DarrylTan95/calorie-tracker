import { pgTable, serial, text, real, integer, date, timestamp, jsonb } from 'drizzle-orm/pg-core';

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
