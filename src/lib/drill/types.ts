import type { ReactNode } from "react";
import type {
  CacheConfig,
  CacheValueOption,
  Constraint,
  CustomKnob,
  CustomCheckResult,
  Flow,
  FlowIncident,
  FlowResult,
  Incident,
  Kind,
  LimiterConfig,
  Load,
  Resilience,
  ServerSize,
  TestResult,
} from "@/sim";

/**
 * A drill is pure data: copy, checks and scenarios. The player in
 * src/components/drill renders any drill that follows these types, so a new drill
 * is a new file in src/content/drills, not new UI.
 */

// ---------------------------------------------------------------- API design

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export const API_FIELD_TYPES = ["string", "url", "integer", "boolean", "timestamp"] as const;
export type ApiFieldType = (typeof API_FIELD_TYPES)[number];

export const STATUS_CODES = [200, 201, 202, 204, 301, 302, 307, 308, 400, 404, 409] as const;

export type ApiField = { name: string; type: ApiFieldType };

export type Endpoint = {
  method: HttpMethod;
  /** e.g. "/links" or "/:slug". Segments starting with ":" are path parameters. */
  path: string;
  body: ApiField[];
  status: number;
  response: ApiField[];
  /** The response sets a Location header. */
  location: boolean;
};

export type ApiRequirement = {
  id: string;
  /** Short name, e.g. "Shorten a link". */
  title: string;
  /** What the user does, in one sentence. */
  story: string;
  /**
   * Returns kind, specific problems with the learner's endpoint; [] means it's right.
   * `all` holds the learner's other endpoints, keyed by requirement id.
   */
  check: (e: Endpoint, all: Record<string, Endpoint>) => string[];
  /** Shown when the endpoint passes. */
  praise: string;
  /** Revealed after a couple of failed checks. */
  hint: string;
};

// ---------------------------------------------------------------- Schema

export const COLUMN_TYPES = [
  "text",
  "varchar(255)",
  "char(7)",
  "integer",
  "bigint",
  "uuid",
  "boolean",
  "timestamp",
  "json",
] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export type Column = { id: string; name: string; type: ColumnType; pk: boolean; unique: boolean };
export type Table = { id: string; name: string; columns: Column[] };
export type SchemaDesign = { engine: string | null; tables: Table[] };

export type DbEngine = {
  id: string;
  /** Becomes the database's label in the simulator. */
  label: string;
  family: "SQL" | "Document" | "Wide-column" | "Key-value";
  /** One line: what it is. */
  blurb: string;
  /** What choosing it means for this product. */
  fit: string;
};

export type SchemaCheck = {
  id: string;
  label: string;
  /** Returns a problem, or null when the schema satisfies this check. */
  check: (s: SchemaDesign, api: Record<string, Endpoint>) => string | null;
};

// ---------------------------------------------------------------- Canvas

export type DbRole = "primary" | "replica";

export type DrillNode = {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  size?: ServerSize;
  role?: DbRole;
  /** Databases: how many shards the data is split over (1-16). */
  shards?: number;
  /** cdn / cache nodes: share of cacheable requests answered here, when the step exposes it. */
  hitRate?: number;
};

export type DrillEdge = { id: string; from: string; to: string };

export type DrillGraph = { nodes: DrillNode[]; edges: DrillEdge[] };

export type DrillConfigs = {
  cache: CacheConfig;
  limiter: LimiterConfig;
  resilience: Resilience;
  /** Selected option id per `DesignStep.customKnobs` id. Missing = the knob's default. */
  custom?: Record<string, string>;
};

/** Inspector controls a design step unlocks. */
export type Knob =
  | "size"
  | "cache"
  | "coalesce"
  | "writeThrough"
  | "limiter"
  | "healthChecks"
  | "replica"
  | "failover"
  | "readFrom"
  /** Inspector: database shard count. */
  | "shards"
  /** Inspector: cdn / cache hit-rate slider. */
  | "hitRate";

export type DrillScenario = {
  /** e.g. "Launch week". */
  label: string;
  load: Load;
  incident?: Incident;
  /** What happens during the incident, in plain words. */
  incidentText?: string;
};

export type Concept = { term: string; text: string; lesson?: string };

export type DebriefContext = {
  graph: DrillGraph;
  configs: DrillConfigs;
  result: TestResult;
  dbLabel: string;
  /** Requests a second the browser answered itself (permanent redirects). */
  clientCached: number;
};

// ---------------------------------------------------------------- Steps

type StepBase = {
  id: string;
  title: string;
  /** Label in the step list; defaults to the title. */
  short?: string;
  minutes: number;
};

export type IntroStep = StepBase & {
  type: "intro";
  /** How the drill works, one line each. */
  how: string[];
};

export type ReadStep = StepBase & {
  type: "read";
  eyebrow?: string;
  body: ReactNode;
};

export type ApiStep = StepBase & {
  type: "api";
  body: ReactNode;
  requirements: ApiRequirement[];
  /** Shown once every endpoint passes. */
  after?: ReactNode;
};

export type SchemaStep = StepBase & {
  type: "schema";
  body: ReactNode;
  engines: DbEngine[];
  checks: SchemaCheck[];
  starter: SchemaDesign;
  after?: ReactNode;
};

export type DesignStep = StepBase & {
  type: "design";
  /** The story card: what's happening to the product right now. */
  story: string;
  scenario: DrillScenario;
  constraints: Constraint[];
  /** Components the learner may add. */
  palette: Kind[];
  knobs: Knob[];
  hints: string[];
  concepts: Concept[];
  /** Used when the canvas is empty on arrival. Otherwise the graph carries over. */
  startGraph?: DrillGraph;
  /** "Why it works": 2–4 sentences written from the learner's own passing design. */
  debrief: (ctx: DebriefContext) => string[];

  // ---- Simulator v2 (see src/sim/flows.ts for a worked example) ----
  /** When present the step is simulated with the flow engine instead of `scenario.load`. */
  flows?: Flow[];
  /** Flow steps: what goes wrong mid-run (instead of `scenario.incident`). */
  incident?: FlowIncident;
  /** Flow steps: the incident in plain words (instead of `scenario.incidentText`). */
  incidentText?: string;
  /** Drill-defined design choices rendered as selects, feeding both the engine and `customChecks`. */
  customKnobs?: CustomKnob[];
  /** Correctness checks throughput can't see (double booking, lost edits). Run after every test. */
  customChecks?: (ctx: CustomCheckContext) => CustomCheckResult[];
  /** Labels for `customChecks`, shown in the "To pass" list before the first run. */
  customCheckLabels?: string[];
  /** Per-kind engine numbers: `{ external: { cap: 5000 }, cdn: { hitRate: 0.95 } }`. */
  nodeDefaults?: Partial<Record<Kind, Record<string, number>>>;
};

export type CustomCheckContext = {
  graph: DrillGraph;
  configs: DrillConfigs;
  /** Selected option id per custom knob id, defaults filled in. */
  knobs: Record<string, string>;
  result: TestResult & { steady: FlowResult };
};

export type ChoiceOption = {
  id: string;
  title: string;
  summary: string;
  pros: string[];
  cons: string[];
  /** When teams pick this. */
  when: string;
};

export type ChooseStep = StepBase & {
  type: "choose";
  body: ReactNode;
  prompt: string;
  options: ChoiceOption[];
  /** Shown once a choice is made. */
  after?: ReactNode;
};

export type FinishStep = StepBase & {
  type: "finish";
  body: ReactNode;
};

export type Step = IntroStep | ReadStep | ApiStep | SchemaStep | DesignStep | ChooseStep | FinishStep;
export type StepType = Step["type"];

// ---------------------------------------------------------------- Drill

export type Requirement = {
  kind: "functional" | "non-functional";
  text: string;
  detail?: string;
};

export type Estimate = { label: string; value: string; math: string };

export type Drill = {
  slug: string;
  /** Bump when steps change shape; old saved progress is then ignored. */
  version: number;
  title: string;
  product: string;
  /** A few sentences: what the product does and why it's interesting to design. */
  intro: ReactNode;
  requirements: Requirement[];
  estimates: Estimate[];
  /** The path parameter cache keys must include, e.g. "slug". */
  cacheParam: string;
  cacheValues: CacheValueOption[];
  related: { lessons: string[]; drills: string[] };
  steps: Step[];
};

// ---------------------------------------------------------------- Saved progress

export type RunSummary = {
  pass: boolean;
  successRate: number;
  p99: number;
  cost: number;
  nodes: number;
  at: number;
};

/** Everything the learner has done in a drill. Persisted locally and, when signed in, on the server. */
export type DrillSave = {
  version: number;
  startedAt: number | null;
  completedAt: number | null;
  updatedAt: number;
  current: number;
  /** Step ids passed. */
  passed: string[];
  api: Record<string, Endpoint>;
  schema: SchemaDesign;
  graph: DrillGraph;
  configs: DrillConfigs;
  choices: Record<string, string>;
  /** Last passing run per design step. */
  runs: Record<string, RunSummary>;
  /** Hints revealed per step. */
  hints: Record<string, number>;
};
