import type { Column, DbEngine, SchemaCheck, SchemaDesign, Table } from "../../../lib/drill/types";

export const ENGINES: DbEngine[] = [
  { id: "postgres", label: "Postgres", family: "SQL", blurb: "Relational, ACID transactions, row locks and unique constraints.", fit: "The natural home for inventory. UPDATE ... WHERE and SELECT ... FOR UPDATE give you the atomic claim, and a unique constraint is a last line of defence against selling a seat twice." },
  { id: "mysql", label: "MySQL", family: "SQL", blurb: "Relational and battle-tested, with InnoDB row locks.", fit: "Behaves like Postgres here: transactions and row locks work, so every double-booking defence in this drill is available." },
  { id: "mongodb", label: "MongoDB", family: "Document", blurb: "JSON documents with single-document atomic updates.", fit: "Each seat can be one document with an atomic findOneAndUpdate. Cross-document work (hold plus booking plus payment) needs multi-document transactions, which you would reach for constantly." },
  { id: "cassandra", label: "Cassandra", family: "Wide-column", blurb: "Massive write throughput, tunable consistency.", fit: "Seat inventory is a small, contended dataset needing strong consistency. Cassandra is built for the opposite: huge, uncontended writes. Lightweight transactions exist but are slow." },
  { id: "dynamodb", label: "DynamoDB", family: "Key-value", blurb: "Managed key-value with conditional writes.", fit: "A conditional write (“set status = held if status = free”) is exactly the atomic claim you need, and it scales. Joins and reports are painful." },
];

export const STARTER_SCHEMA: SchemaDesign = {
  engine: null,
  tables: [{ id: "t-seats", name: "seats", columns: [{ id: "c-id", name: "id", type: "bigint", pk: true, unique: false }] }],
};

const lower = (x: string) => x.trim().toLowerCase();
const seatsTable = (s: SchemaDesign): Table | undefined => s.tables.find((t) => /seat|inventory/.test(lower(t.name)));
const inTable = (t: Table | undefined, re: RegExp): Column | undefined => t?.columns.find((c) => re.test(lower(c.name)));
const bookings = (s: SchemaDesign): Table | undefined => s.tables.find((t) => /booking|ticket|order|purchase/.test(lower(t.name)));

export const SCHEMA_CHECKS: SchemaCheck[] = [
  { id: "engine", label: "A database is chosen", check: (s) => (s.engine ? null : "Pick an engine. Think about which one can say “claim this seat only if it is still free” in a single atomic step.") },
  {
    id: "seats-event",
    label: "Seats belong to an event",
    check: (s) => {
      const t = seatsTable(s);
      if (!t) return "Keep a seats table: one row per seat per event.";
      return inTable(t, /event/) ? null : "Add event_id to seats. The seat map reads “all seats of this event”, so it is also your most important index.";
    },
  },
  {
    id: "status",
    label: "A seat's state is stored",
    check: (s) => {
      const c = inTable(seatsTable(s), /status|state/);
      if (!c) return "Add a status column to seats (free, held, sold). The seat map and the hold both read it.";
      return c.type === "text" || c.type === "varchar(255)" ? null : "Status is a short word like free, held or sold. Use text.";
    },
  },
  {
    id: "held-until",
    label: "Holds carry an expiry",
    check: (s) => {
      const c = inTable(seatsTable(s), /held_until|hold_expires|expires|until/);
      if (!c) return "Add held_until to seats. Without it a hold has no end, and a worker has nothing to look for.";
      return c.type === "timestamp" ? null : "An expiry is a point in time: use timestamp so the database can compare and index it.";
    },
  },
  {
    id: "version",
    label: "Seats can be updated safely",
    check: (s) => {
      const c = inTable(seatsTable(s), /version|rev/);
      if (!c) return "Add a version column (integer) to seats. Even if you lock rows, it is the cheapest guard against two writers overwriting each other.";
      return c.type === "integer" || c.type === "bigint" ? null : "A version is a counter. Use integer.";
    },
  },
  {
    id: "one-booking",
    label: "A seat can only be booked once, by the database",
    check: (s) => {
      const t = bookings(s);
      if (!t) return "Add a bookings table: one row per sold seat. That is where “sold” becomes permanent.";
      const c = inTable(t, /seat/);
      if (!c) return "bookings needs a seat_id column.";
      return c.pk || c.unique ? null : "Mark bookings.seat_id unique. If a bug in your code ever tries to sell the same seat twice, the database refuses. It is your last line of defence.";
    },
  },
  {
    id: "idem",
    label: "A retried payment can't book twice",
    check: (s) => {
      const t = bookings(s);
      const c = inTable(t, /idem|request|key/);
      if (!t) return "Add the bookings table first.";
      if (!c) return "Store the idempotency key from the payment request on the booking.";
      return c.unique || c.pk ? null : "The key only helps if it is unique. Mark it unique so a second insert with the same key fails instead of creating a second booking.";
    },
  },
  {
    id: "paid-at",
    label: "You know when each booking happened",
    check: (s) => {
      const t = bookings(s);
      const c = inTable(t, /created|paid|booked/);
      if (!c) return "Add created_at (timestamp) to bookings, for receipts, refunds and “who got in first” disputes.";
      return c.type === "timestamp" ? null : "Times are timestamps, not " + c.type + ".";
    },
  },
];
