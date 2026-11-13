import assert from "node:assert/strict";
import test from "node:test";
import { formatDate, localDateTimeToUtc, toDateTimeLocalInput, toIsoDateTime } from "./time.js";

test("public date helpers format dates in the requested timezone and return ISO datetimes", () => {
  const value = new Date("2026-11-05T00:00:00.000Z");
  assert.equal(formatDate(value, "Asia/Colombo"), "05 Nov 2026");
  assert.equal(toIsoDateTime(value), "2026-11-05T00:00:00.000Z");
  assert.equal(toIsoDateTime("not-a-date"), "");
});

test("scheduled local datetimes convert to UTC and reject invalid or missing DST times", () => {
  const utc = localDateTimeToUtc("2026-11-04T15:00", "Asia/Colombo");
  assert.equal(utc.toISOString(), "2026-11-04T09:30:00.000Z");
  assert.equal(toDateTimeLocalInput(utc, "Asia/Colombo"), "2026-11-04T15:00");
  assert.throws(() => localDateTimeToUtc("2026-02-30T15:00", "UTC"), /valid scheduled/u);
  assert.throws(() => localDateTimeToUtc("2026-03-08T02:30", "America/New_York"), /does not exist/u);
});
