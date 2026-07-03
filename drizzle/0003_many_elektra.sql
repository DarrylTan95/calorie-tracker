CREATE TABLE "weekly_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_start" date NOT NULL,
	"weight_trend_percent" real,
	"calorie_adherence_percent" real NOT NULL,
	"protein_adherence_percent" real NOT NULL,
	"workouts_completed" integer NOT NULL,
	"workouts_planned" integer NOT NULL,
	"recommendation" jsonb NOT NULL,
	"applied" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
