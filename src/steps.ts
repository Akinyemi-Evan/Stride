import { Platform } from "react-native";
import { authorizeAppleHealth, readAppleHealthSteps } from "./appleHealth";
import { localDate, type StepSource } from "./game";

export type Reading = { steps: number; date: string; source: StepSource };
export async function connectSteps(
  onReading: (reading: Reading) => void,
  onError: (message: string) => void,
): Promise<() => void> {
  if (Platform.OS === "web")
    throw new Error(
      "Open the iPhone or Android build to connect your steps. The browser has a separate demo.",
    );
  if (Platform.OS === "ios") {
    let health: typeof import("@kingstinct/react-native-healthkit");
    try {
      health = await import("@kingstinct/react-native-healthkit");
    } catch {
      throw new Error(
        "Apple Health requires a new Stride iPhone development or TestFlight build. It is not available in Expo Go.",
      );
    }
    await authorizeAppleHealth(health);
    let disposed = false,
      busy = false;
    const refresh = async (initial = false) => {
      if (disposed || busy) return;
      busy = true;
      try {
        const reading = await readAppleHealthSteps(health);
        if (!disposed) {
          if (reading) onReading(reading);
          else
            onError(
              "No readable Apple Health steps yet. Check Stride�s Steps access in the Health app and that your iPhone or Apple Watch has synced today�s steps.",
            );
        }
      } catch (error) {
        if (initial) throw error;
        if (!disposed)
          onError(
            "Could not refresh Apple Health. Unlock your iPhone, check Steps access in Health, then sync again.",
          );
      } finally {
        busy = false;
      }
    };
    await refresh(true);
    // Re-query today's full total; timers are stopped when the app backgrounds.
    const timer = setInterval(() => {
      void refresh();
    }, 15000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }
  const hc = await import("react-native-health-connect");
  if (!(await hc.initialize()))
    throw new Error(
      "Health Connect is unavailable. Install or update it, then use a Stride development build.",
    );
  const granted = await hc.requestPermission([
    { accessType: "read", recordType: "Steps" },
  ]);
  if (!granted.some((p) => p.recordType === "Steps" && p.accessType === "read"))
    throw new Error(
      "Allow read access to Steps in Health Connect to continue.",
    );
  let disposed = false,
    busy = false;
  const refresh = async () => {
    if (disposed || busy) return;
    busy = true;
    const end = new Date(),
      start = new Date(end);
    start.setHours(0, 0, 0, 0);
    try {
      const result = await hc.aggregateRecord({
        recordType: "Steps",
        timeRangeFilter: {
          operator: "between",
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        },
      });
      if (!disposed)
        onReading({
          steps: result.COUNT_TOTAL ?? 0,
          date: localDate(end),
          source: "health-connect",
        });
    } catch {
      if (!disposed)
        onError(
          "Health Connect could not refresh. Check that your fitness app is sharing Steps.",
        );
    } finally {
      busy = false;
    }
  };
  await refresh();
  const timer = setInterval(() => {
    void refresh();
  }, 30000);
  return () => {
    disposed = true;
    clearInterval(timer);
  };
}
