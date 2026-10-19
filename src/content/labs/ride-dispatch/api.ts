import type { ApiRequirement, Endpoint } from "../../../lib/lab/types";

const segments = (path: string) => path.split("/").filter(Boolean);
const params = (path: string) => segments(path).filter((s) => s.startsWith(":"));
const named = (fields: Endpoint["body"]) => fields.filter((f) => f.name.trim());

export const LAT = /lat/i;
export const LNG = /lng|lon/i;

export const API_REQUIREMENTS: ApiRequirement[] = [
  {
    id: "location",
    title: "Report driver location",
    story: "A driver's phone tells the server where it is, every four seconds, for hours.",
    praise: "An idempotent PUT to the driver's own location, answering 204 No Content. Nothing to say back, 50,000 times a second.",
    hint: "Try PUT /drivers/:driver_id/location with { lat: string, lng: string, updated_at: timestamp }, answering 204.",
    check: (e) => {
      const p: string[] = [];
      if (e.method === "GET") p.push("Reporting a location changes state. A GET must be safe, so use PUT (or POST).");
      else if (e.method === "DELETE" || e.method === "PATCH") p.push(`${e.method} is not the natural verb for 'here is my latest position'. PUT replaces the driver's last known location.`);
      if (!params(e.path).length) p.push("Say whose location it is: /drivers/:driver_id/location.");
      const b = named(e.body);
      if (!b.some((f) => LAT.test(f.name)) || !b.some((f) => LNG.test(f.name))) p.push("Send both coordinates: lat and lng.");
      if (!b.some((f) => /time|at$|ts/i.test(f.name))) p.push("Add a timestamp. Updates arrive out of order on a bad network, and only the newest one should win.");
      if (e.status === 200 || e.status === 201) p.push("There is nothing to return and this runs 50,000 times a second. 204 No Content saves bytes and thought.");
      else if (e.status !== 204 && e.status !== 202) p.push(`${e.status} does not fit. Use 204 No Content.`);
      return p;
    },
  },
  {
    id: "request",
    title: "Request a ride",
    story: "A rider taps 'Ride now'. Finding the driver takes a moment, and she should not stare at a spinner tied to one HTTP call.",
    praise: "A POST that creates the ride and answers 202: 'on it'. Matching continues in the background, and the app watches the ride.",
    hint: "Try POST /rides with { pickup_lat: string, pickup_lng: string }, answering 202 with { ride_id: string, status: string }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "POST") p.push("Requesting a ride creates one: POST.");
      if (params(e.path).length) p.push("The ride does not exist yet, so its id cannot be in the path. POST to /rides.");
      const b = named(e.body);
      if (!b.some((f) => /pickup|origin|from|lat/i.test(f.name))) p.push("The server needs the pickup point. Add pickup_lat and pickup_lng.");
      if (e.status === 200 || e.status === 201) p.push(`${e.status} suggests a driver is found. Matching takes seconds and may fail, so say 202 Accepted and let the app follow progress.`);
      else if (e.status !== 202) p.push(`${e.status} does not describe a ride that was accepted for matching. Use 202.`);
      const r = named(e.response);
      if (!r.some((f) => /id/i.test(f.name))) p.push("Return a ride_id so the app can follow it.");
      if (!r.some((f) => /status|state/i.test(f.name))) p.push("Return a status (searching, matched, ...).");
      return p;
    },
  },
  {
    id: "ride",
    title: "Follow a ride",
    story: "After requesting, the rider opens the app and wants to know: is a driver coming, who, and how long?",
    praise: "A GET by ride id gives the app a fallback it can always call. Live movement will arrive over a WebSocket, but this endpoint is the source of truth when the connection drops.",
    hint: "Try GET /rides/:ride_id answering 200 with { status: string, driver_id: string, eta_seconds: integer }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push("Reading a ride changes nothing: GET.");
      if (!params(e.path).length) p.push("Name the ride: /rides/:ride_id.");
      if (e.status !== 200) p.push(`${e.status} is not the answer to a successful read. Use 200.`);
      const r = named(e.response);
      if (!r.some((f) => /status|state/i.test(f.name))) p.push("Return the ride's status.");
      if (!r.some((f) => /driver/i.test(f.name))) p.push("Return the driver (driver_id) once matched, so the app can show who is coming.");
      const eta = r.find((f) => /eta|minutes|seconds|arriv/i.test(f.name));
      if (!eta) p.push("Return an ETA, like eta_seconds.");
      else if (eta.type !== "integer") p.push(`${eta.name} is a duration. Make it an integer number of seconds.`);
      return p;
    },
  },
];
