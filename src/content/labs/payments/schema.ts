import type { Column, DbEngine, SchemaCheck, SchemaDesign, Table } from "../../../lib/lab/types";

export const ENGINES: DbEngine[] = [
  { id: "postgres", label: "Postgres", family: "SQL", blurb: "ACID transactions, unique constraints, check constraints.", fit: "Money wants multi-row transactions: write the payment, two ledger entries and an outbox row, all or nothing. Postgres is the default answer." },
  { id: "mysql", label: "MySQL", family: "SQL", blurb: "InnoDB transactions and unique indexes.", fit: "Equivalent here. Keep strict mode on so bad data is rejected, not trimmed." },
  { id: "mongodb", label: "MongoDB", family: "Document", blurb: "Documents with multi-document transactions.", fit: "Possible, but you will lean on transactions and unique indexes constantly, which is what relational databases are built around." },
  { id: "cassandra", label: "Cassandra", family: "Wide-column", blurb: "Huge write throughput, tunable consistency.", fit: "No multi-row transactions. Balancing a ledger across rows without them is how money disappears." },
  { id: "dynamodb", label: "DynamoDB", family: "Key-value", blurb: "Managed key-value with conditional writes and transactions.", fit: "TransactWriteItems gives you atomicity across a few items, and idempotency keys fit conditional writes. Ad-hoc ledger queries and reconciliation are the painful part." },
];

export const STARTER_SCHEMA: SchemaDesign = {
  engine: null,
  tables: [{ id: "t-payments", name: "payments", columns: [{ id: "c-id", name: "id", type: "uuid", pk: true, unique: false }] }],
};

const lower = (x: string) => x.trim().toLowerCase();
const table = (s: SchemaDesign, re: RegExp): Table | undefined => s.tables.find((t) => re.test(lower(t.name)));
const col = (t: Table | undefined, re: RegExp): Column | undefined => t?.columns.find((c) => re.test(lower(c.name)));
const payments = (s: SchemaDesign) => table(s, /^payments?$|charge/);
const ledger = (s: SchemaDesign) => table(s, /ledger|entr/);
const outbox = (s: SchemaDesign) => table(s, /outbox|event/);

export const SCHEMA_CHECKS: SchemaCheck[] = [
  { id: "engine", label: "A database is chosen", check: (s) => (s.engine ? null : "Pick an engine. Ask which can make several rows change together or not at all.") },
  {
    id: "amount",
    label: "Money is stored as whole units",
    check: (s) => {
      const c = col(payments(s), /amount|cents|total/);
      if (!c) return "Add an amount column to payments.";
      if (c.type === "bigint" || c.type === "integer") return null;
      return `${c.type} cannot hold money safely. Store the amount as a bigint count of the smallest unit (paise or cents).`;
    },
  },
  {
    id: "currency",
    label: "Every amount has a currency",
    check: (s) => (col(payments(s), /currency|ccy/) ? null : "Add a currency column. ₹100 and $100 are not the same number."),
  },
  {
    id: "idem",
    label: "The database refuses a repeated payment",
    check: (s) => {
      const c = col(payments(s), /idem|request_id|key/);
      if (!c) return "Store the idempotency key on the payment.";
      return c.unique || c.pk ? null : "Mark the key unique. The unique index is what makes a double-submit fail loudly instead of charging again.";
    },
  },
  {
    id: "status",
    label: "A payment's state is tracked",
    check: (s) => (col(payments(s), /status|state/) ? null : "Add status (pending, succeeded, failed, refunded). A payment is a small state machine, and a retry needs to know where it stopped."),
  },
  {
    id: "ledger",
    label: "Money moves as ledger entries, never edits",
    check: (s) => {
      const t = ledger(s);
      if (!t) return "Add a ledger_entries table: one row per movement of money, never updated.";
      if (!col(t, /account/)) return "Each entry belongs to an account. Add account_id.";
      const a = col(t, /amount|delta|value/);
      if (!a) return "Each entry has an amount. Add it, signed or with a debit/credit direction.";
      if (a.type !== "bigint" && a.type !== "integer") return "Ledger amounts are whole units too: bigint.";
      if (!col(t, /payment|ref/)) return "Link each entry back to its payment with payment_id, so every cent can be traced.";
      return null;
    },
  },
  {
    id: "outbox",
    label: "Events wait in an outbox",
    check: (s) => {
      const t = outbox(s);
      if (!t) return "Add an outbox table. An event row written with the payment, in the same transaction, can never be lost.";
      if (!col(t, /payload|body|data|type/)) return "The outbox row needs a payload (json) describing what happened.";
      if (!col(t, /published|sent|processed|delivered/)) return "Add published_at (timestamp), null until the relay has sent it. That is how it knows what is left.";
      return null;
    },
  },
  {
    id: "created",
    label: "Every row has a time",
    check: (s) => {
      const c = col(payments(s), /created|at$/);
      if (!c) return "Add created_at (timestamp) to payments. Reconciliation matches by day.";
      return c.type === "timestamp" ? null : "Times are timestamps.";
    },
  },
];
