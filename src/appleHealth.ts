import { localDate } from "./game";

type HealthKit = Pick<
  typeof import("@kingstinct/react-native-healthkit"),
  | "isHealthDataAvailable"
  | "requestAuthorization"
  | "queryStatisticsForQuantity"
>;
export const STEP_TYPE = "HKQuantityTypeIdentifierStepCount";

export async function authorizeAppleHealth(health: HealthKit) {
  if (!health.isHealthDataAvailable())
    throw new Error(
      "Apple Health is unavailable. Use a Stride iPhone development or TestFlight build; Expo Go and browsers cannot connect.",
    );
  if (
    !(await health.requestAuthorization({ toRead: [STEP_TYPE], toShare: [] }))
  )
    throw new Error(
      "Apple Health could not complete the permission request. Try connecting again.",
    );
  // HealthKit deliberately does not reveal whether read access was granted.
}

export async function readAppleHealthSteps(
  health: HealthKit,
  end = new Date(),
) {
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  // Let HealthKit aggregate sources; never add iPhone and Watch samples ourselves.
  const result = await health.queryStatisticsForQuantity(
    STEP_TYPE,
    ["cumulativeSum"],
    {
      unit: "count",
      filter: { date: { startDate: start, endDate: end } },
    },
  );
  const steps = result.sumQuantity?.quantity;
  // An empty result can mean no samples OR denied/revoked access. Preserve progress.
  if (steps === undefined) return null;
  if (!Number.isFinite(steps) || steps < 0 || steps > 150000)
    throw new Error(
      "Apple Health returned an invalid step total. Please try syncing again.",
    );
  return {
    steps: Math.floor(steps),
    date: localDate(end),
    source: "apple-health" as const,
  };
}
