import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authorizeAppleHealth,
  readAppleHealthSteps,
  STEP_TYPE,
} from "../src/appleHealth";

type Health = Parameters<typeof readAppleHealthSteps>[0];
type MutableHealth = { -readonly [K in keyof Health]: Health[K] };
function fakeHealth(quantity?: number) {
  return {
    isHealthDataAvailable: () => true,
    requestAuthorization: async (_permissions: unknown) => true,
    queryStatisticsForQuantity: async (..._args: unknown[]) => ({
      sources: [],
      ...(quantity === undefined
        ? {}
        : { sumQuantity: { quantity, unit: "count" } }),
    }),
  } as unknown as MutableHealth;
}

test("Apple Health requests only read Steps, and handles unavailable/cancelled authorization", async () => {
  const health = fakeHealth();
  health.requestAuthorization = async (permissions) => {
    assert.deepEqual(permissions, { toRead: [STEP_TYPE], toShare: [] });
    return true;
  };
  await authorizeAppleHealth(health);
  health.isHealthDataAvailable = () => false;
  await assert.rejects(authorizeAppleHealth(health), /unavailable/);
  health.isHealthDataAvailable = () => true;
  health.requestAuthorization = async () => false;
  await assert.rejects(authorizeAppleHealth(health), /permission request/);
});

test("daily aggregate uses local midnight and replaces totals instead of adding sources or refreshes", async () => {
  const health = fakeHealth(4321);
  const end = new Date(2026, 8, 18, 15, 10);
  health.queryStatisticsForQuantity = async (type, statistics, options) => {
    assert.equal(type, STEP_TYPE);
    assert.deepEqual(statistics, ["cumulativeSum"]);
    assert.deepEqual(options, {
      unit: "count",
      filter: {
        date: {
          startDate: new Date(2026, 8, 18),
          endDate: end,
        },
      },
    });
    return { sources: [], sumQuantity: { quantity: 4321, unit: "count" } };
  };
  const first = await readAppleHealthSteps(health, end);
  assert.deepEqual(first, {
    steps: 4321,
    date: "2026-09-18",
    source: "apple-health",
  });
  assert.deepEqual(await readAppleHealthSteps(health, end), first);
  assert.equal(
    (await readAppleHealthSteps(fakeHealth(12), new Date(2026, 8, 19, 0, 1)))
      ?.date,
    "2026-09-19",
  );
});

test("missing or revoked read access is not interpreted as zero; invalid data and failures do not become readings", async () => {
  assert.equal(await readAppleHealthSteps(fakeHealth()), null);
  assert.equal((await readAppleHealthSteps(fakeHealth(0)))?.steps, 0);
  for (const value of [-1, NaN, Infinity, 150001])
    await assert.rejects(readAppleHealthSteps(fakeHealth(value)), /invalid/);
  const health = fakeHealth();
  health.queryStatisticsForQuantity = async () => {
    throw new Error("Device locked");
  };
  await assert.rejects(readAppleHealthSteps(health), /Device locked/);
});
