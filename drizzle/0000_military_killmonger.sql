CREATE TABLE "profile" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"weight_kg" real NOT NULL,
	"height_cm" real NOT NULL,
	"age" integer NOT NULL,
	"gender" text NOT NULL,
	"goal" text NOT NULL,
	"gym_days_per_week" integer NOT NULL,
	"experience" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"effective_from" date NOT NULL,
	"calculated" jsonb NOT NULL,
	"overrides" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weight_log" (
	"date" date PRIMARY KEY NOT NULL,
	"weight_kg" real NOT NULL
);
