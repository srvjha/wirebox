import type { ReactNode } from "react";
import type {
  CacheConfig,
  CacheValueOption,
  Constraint,
  Incident,
  Kind,
  LimiterConfig,
  Load,
  Resilience,
  ServerSize,
  TestResult,
} from "@/sim";

/**
 * A lab is pure data: copy, checks and scenarios. The player in
 * src/components/lab renders any lab that follows these types, so a new lab
 * is a new file in src/content/labs, not new UI.
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

export type LabNode = {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  size?: ServerSize;
  role?: DbRole;
};

export type LabEdge = { id: string; from: string; to: string };

export type LabGraph = { nodes: LabNode[]; edges: LabEdge[] };

export type LabConfigs = {
  cache: CacheConfig;
  limiter: LimiterConfig;
  resilience: Resilience;
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
  | "readFrom";

export type LabScenario = {
  /** e.g. "Launch week". */
  label: string;
  load: Load;
  incident?: Incident;
  /** What happens during the incident, in plain words. */
  incidentText?: string;
};

export type Concept = { term: string; text: string; lesson?: string };

export type DebriefContext = {
  graph: LabGraph;
  configs: LabConfigs;
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
  /** How the lab works, one line each. */
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
  scenario: LabScenario;
  constraints: Constraint[];
  /** Components the learner may add. */
  palette: Kind[];
  knobs: Knob[];
  hints: string[];
  concepts: Concept[];
  /** Used when the canvas is empty on arrival. Otherwise the graph carries over. */
  startGraph?: LabGraph;
  /** "Why it works": 2–4 sentences written from the learner's own passing design. */
  debrief: (ctx: DebriefContext) => string[];
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

// ---------------------------------------------------------------- Lab

export type Requirement = {
  kind: "functional" | "non-functional";
  text: string;
  detail?: string;
};

export type Estimate = { label: string; value: string; math: string };

export type Lab = {
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
  related: { lessons: string[]; labs: string[] };
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

/** Everything the learner has done in a lab. Persisted locally and, when signed in, on the server. */
export type LabSave = {
  version: number;
  startedAt: number | null;
  completedAt: number | null;
  updatedAt: number;
  current: number;
  /** Step ids passed. */
  passed: string[];
  api: Record<string, Endpoint>;
  schema: SchemaDesign;
  graph: LabGraph;
  configs: LabConfigs;
  choices: Record<string, string>;
  /** Last passing run per design step. */
  runs: Record<string, RunSummary>;
  /** Hints revealed per step. */
  hints: Record<string, number>;
};
