import test from "node:test";
import assert from "node:assert/strict";
import {
  dateKey,
  monthDays,
  parseDate,
  shiftMonth,
} from "../src/date-utils.ts";

test("date input rejects impossible dates instead of silently rolling forward", () => {
  for (const value of [
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-9-1",
    "0000-01-01",
    "",
  ])
    assert.equal(parseDate(value), null, value);
  assert.equal(dateKey(parseDate("2024-02-29")), "2024-02-29");
});

test("month navigation clamps month ends and handles year boundaries", () => {
  assert.equal(dateKey(shiftMonth(parseDate("2024-01-31"), 1)), "2024-02-29");
  assert.equal(dateKey(shiftMonth(parseDate("2026-03-31"), -1)), "2026-02-28");
  assert.equal(dateKey(shiftMonth(parseDate("2026-12-15"), 1)), "2027-01-15");
});

test("calendar shows six Monday-first weeks including adjacent months", () => {
  const days = monthDays(parseDate("2026-09-28"));
  assert.equal(days.length, 42);
  assert.equal(days[0].getDay(), 1);
  assert.equal(dateKey(days[0]), "2026-08-31");
  assert.equal(dateKey(days.at(-1)), "2026-10-11");
});
