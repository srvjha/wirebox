import type { Column, DbEngine, SchemaCheck, SchemaDesign, Table } from "../../../lib/lab/types";

export const ENGINES: DbEngine[] = [
  { id: "postgres", label: "Postgres", family: "SQL", blurb: "Relational with PostGIS for geographic queries.", fit: "A good home for rides, riders and drivers: strict, transactional. Do not point 50,000 location writes a second at it; keep the live positions in memory and checkpoint here." },
  { id: "redis", label: "Redis", family: "Key-value", blurb: "In-memory data structures, including a geo index.", fit: "Perfect for live driver positions (GEOADD, geohash keys, TTLs). Volatile by design: it is the index, not the record of rides." },
  { id: "mongodb", label: "MongoDB", family: "Document", blurb: "Documents with a built-in 2dsphere geo index.", fit: "Geo queries come built in, and sharding is native. Heavy update rates on indexed locations get expensive." },
  { id: "cassandra", label: "Cassandra", family: "Wide-column", blurb: "Huge write throughput, partitioned by key.", fit: "A natural fit for ride and location history written constantly. Poor at 'who is near this point' unless you design the key around cells." },
  { id: "dynamodb", label: "DynamoDB", family: "Key-value", blurb: "Managed key-value, partitioned by hash.", fit: "Scales writes without effort. Proximity search needs a geohash key you maintain yourself." },
];

export const STARTER_SCHEMA: SchemaDesign = {
  engine: null,
  tables: [{ id: "t-drivers", name: "drivers", columns: [{ id: "c-id", name: "id", type: "bigint", pk: true, unique: false }] }],
};

const lower = (x: string) => x.trim().toLowerCase();
const table = (s: SchemaDesign, re: RegExp): Table | undefined => s.tables.find((t) => re.test(lower(t.name)));
const col = (t: Table | undefined, re: RegExp): Column | undefined => t?.columns.find((c) => re.test(lower(c.name)));
const drivers = (s: SchemaDesign) => table(s, /driver|vehicle|cab/);
const rides = (s: SchemaDesign) => table(s, /ride|trip/);

export const SCHEMA_CHECKS: SchemaCheck[] = [
  { id: "engine", label: "A database is chosen", check: (s) => (s.engine ? null : "Pick an engine. Remember there are two jobs here: a record of rides, and a live map of 200,000 moving cars.") },
  {
    id: "driver-location",
    label: "Drivers have a location",
    check: (s) => {
      const t = drivers(s);
      if (!t) return "Keep a drivers table.";
      return col(t, /lat/) && col(t, /lng|lon/) ? null : "Store the last known position: lat and lng columns on drivers.";
    },
  },
  {
    id: "cell",
    label: "Locations are indexed by cell",
    check: (s) => {
      const c = col(drivers(s), /geohash|cell|h3|tile|quad/);
      if (!c) return "A pair of coordinates cannot be searched by 'near'. Add a geohash (or cell id) column derived from lat/lng: nearby drivers share a prefix.";
      return c.type === "text" || c.type === "varchar(255)" || c.type === "char(7)" || c.type === "bigint" ? null : "A geohash is a short string. Use text.";
    },
  },
  {
    id: "driver-status",
    label: "Availability is tracked",
    check: (s) => (col(drivers(s), /status|state|available/) ? null : "Add status to drivers (available, on_trip, offline). Matching only wants available drivers."),
  },
  {
    id: "driver-city",
    label: "Drivers belong to a city",
    check: (s) => (col(drivers(s), /city|region|zone/) ? null : "Add city_id to drivers. It is the coarse partition: a rider in Pune never needs a driver in Delhi, and it is your shard key."),
  },
  {
    id: "ride-parties",
    label: "A ride links a rider and a driver",
    check: (s) => {
      const t = rides(s);
      if (!t) return "Add a rides table: one row per trip request.";
      if (!col(t, /rider|user|customer/)) return "rides needs a rider_id.";
      return col(t, /driver/) ? null : "rides needs a driver_id (null until someone is matched).";
    },
  },
  {
    id: "ride-status",
    label: "A ride's progress is tracked",
    check: (s) => (col(rides(s), /status|state/) ? null : "Add status to rides (searching, matched, picked_up, completed, cancelled). The follow-a-ride endpoint reads it."),
  },
  {
    id: "ride-city",
    label: "Rides carry their city",
    check: (s) => (col(rides(s), /city|region|zone/) ? null : "Add city_id to rides too, so a city's rides live on the same shard as its drivers."),
  },
];
