export type StepSource =
  "demo" | "ios-motion" | "apple-health" | "health-connect";
export type Day = {
  date: string;
  steps: number;
  goal: number;
  source: StepSource;
  claimed: string[];
};
export type Game = {
  version: 1;
  name: string;
  goal: number;
  nextGoal: number;
  today: Day;
  history: Day[];
  xp: number;
  coins: number;
  atlas?: string;
  photo?: string;
};
export const STAGES = [
  "Fresh start",
  "Finding rhythm",
  "Making moves",
  "In your stride",
  "Almost there",
  "Peak form",
];
export const QUESTS = [
  {
    id: "first",
    title: "Find your rhythm",
    subtitle: "Reach 25% of your daily goal",
    fraction: 0.25,
    xp: 50,
    coins: 10,
  },
  {
    id: "half",
    title: "Go the extra mile",
    subtitle: "Make it to the halfway mark",
    fraction: 0.5,
    xp: 100,
    coins: 20,
  },
  {
    id: "peak",
    title: "Meet your peak",
    subtitle: "Complete your daily walking goal",
    fraction: 1,
    xp: 250,
    coins: 50,
  },
];
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function createGame(
  source: StepSource = "demo",
  date = localDate(),
): Game {
  return {
    version: 1,
    name: "Walker",
    goal: 8000,
    nextGoal: 8000,
    today: { date, steps: 0, goal: 8000, source, claimed: [] },
    history: [],
    xp: 0,
    coins: 0,
  };
}
export function progress(steps: number, goal: number) {
  return Math.max(
    0,
    Math.min(1, Number.isFinite(steps) && goal > 0 ? steps / goal : 0),
  );
}
export function stageFor(steps: number, goal: number) {
  return Math.min(5, Math.floor(progress(steps, goal) * 5));
}
export function normalizeSteps(steps: number) {
  if (!Number.isFinite(steps) || steps < 0 || steps > 150000)
    throw new Error("Steps must be between 0 and 150,000.");
  return Math.floor(steps);
}
export function validGoal(goal: number) {
  return Number.isInteger(goal) && goal >= 1000 && goal <= 50000;
}
export function rollover(game: Game, date = localDate()): Game {
  if (game.today.date === date) return game;
  // Archive once; timezone changes cannot repeatedly award a completed day.
  const history = [
    ...game.history.filter((day) => day.date !== game.today.date),
    game.today,
  ].slice(-365);
  const existing = history.find((day) => day.date === date);
  return {
    ...game,
    goal: game.nextGoal,
    history: history.filter((day) => day.date !== date),
    today: existing ?? {
      date,
      steps: 0,
      goal: game.nextGoal,
      source: game.today.source,
      claimed: [],
    },
  };
}
export function setSteps(game: Game, steps: number, date = localDate()): Game {
  const current = rollover(game, date);
  return {
    ...current,
    today: { ...current.today, steps: normalizeSteps(steps) },
  };
}
export function changeGoal(game: Game, goal: number): Game {
  if (!validGoal(goal))
    throw new Error("Choose a goal from 1,000 to 50,000 steps.");
  // Once walking starts, today's denominator is fixed. New goals apply tomorrow.
  return game.today.steps > 0
    ? { ...game, nextGoal: goal }
    : { ...game, goal, nextGoal: goal, today: { ...game.today, goal } };
}
export function claim(game: Game, id: string): Game {
  const quest = QUESTS.find((q) => q.id === id);
  if (
    !quest ||
    game.today.claimed.includes(id) ||
    progress(game.today.steps, game.today.goal) < quest.fraction
  )
    return game;
  return {
    ...game,
    xp: game.xp + quest.xp,
    coins: game.coins + quest.coins,
    today: { ...game.today, claimed: [...game.today.claimed, id] },
  };
}
export function streak(game: Game) {
  const days = new Map(
    [...game.history, game.today].map((day) => [day.date, day]),
  );
  const date = new Date(`${game.today.date}T12:00:00`);
  if (game.today.steps < game.today.goal) date.setDate(date.getDate() - 1);
  let count = 0;
  for (let i = 0; i < 366; i++) {
    const day = days.get(localDate(date));
    if (!day || day.steps < day.goal) break;
    count++;
    date.setDate(date.getDate() - 1);
  }
  return count;
}
function isDay(day: unknown): day is Day {
  if (!day || typeof day !== "object") return false;
  const d = day as Day;
  return (
    typeof d.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
    Number.isFinite(new Date(`${d.date}T12:00:00`).getTime()) &&
    Number.isInteger(d.steps) &&
    d.steps >= 0 &&
    d.steps <= 150000 &&
    validGoal(d.goal) &&
    ["demo", "ios-motion", "apple-health", "health-connect"].includes(
      d.source,
    ) &&
    Array.isArray(d.claimed) &&
    d.claimed.every((id) => QUESTS.some((q) => q.id === id))
  );
}
export function restoreGame(raw: string | null, source: StepSource): Game {
  if (!raw) return createGame(source);
  try {
    const g = JSON.parse(raw) as Game;
    if (
      g.version !== 1 ||
      !validGoal(g.goal) ||
      !validGoal(g.nextGoal) ||
      !isDay(g.today) ||
      !Array.isArray(g.history) ||
      !g.history.every(isDay) ||
      !Number.isFinite(g.xp) ||
      g.xp < 0 ||
      !Number.isFinite(g.coins) ||
      g.coins < 0 ||
      typeof g.name !== "string"
    )
      return createGame(source);
    normalizeSteps(g.today.steps);
    if (
      source === "demo" ? g.today.source !== "demo" : g.today.source === "demo"
    )
      return createGame(source);
    return rollover(g);
  } catch {
    return createGame(source);
  }
}
