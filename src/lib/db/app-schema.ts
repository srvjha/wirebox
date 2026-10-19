import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

/** One row per finished lesson. */
export const lessonProgress = pgTable(
  "lesson_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull(),
    completedAt: timestamp("completed_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] })],
);

/** The learner's saved drill state: steps passed, their API, schema and canvas. */
export const drillProgress = pgTable(
  "drill_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    drillSlug: text("drill_slug").notNull(),
    drillVersion: integer("drill_version").notNull(),
    state: jsonb("state").notNull(),
    stepsDone: integer("steps_done").notNull().default(0),
    completedAt: timestamp("completed_at"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.drillSlug] })],
);

/** Every load test a signed-in learner runs. Feeds the admin dashboard. */
export const loadTestRun = pgTable(
  "load_test_run",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    drillSlug: text("drill_slug").notNull(),
    step: integer("step").notNull(),
    pass: boolean("pass").notNull(),
    successRate: real("success_rate").notNull(),
    p99Ms: integer("p99_ms").notNull(),
    costUsd: integer("cost_usd").notNull(),
    nodes: integer("nodes").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("load_test_run_drill_idx").on(t.drillSlug, t.step)],
);

/** AI debriefs, kept so we never pay twice for the same design. */
export const postmortem = pgTable(
  "postmortem",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    drillSlug: text("drill_slug").notNull(),
    step: integer("step").notNull(),
    designHash: text("design_hash").notNull(),
    response: text("response").notNull(),
    model: text("model").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("postmortem_lookup_idx").on(t.userId, t.drillSlug, t.step, t.designHash)],
);
