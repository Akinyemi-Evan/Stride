import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  setSteps,
  stageFor,
  claim,
  rollover,
  changeGoal,
  streak,
  restoreGame,
} from "../src/game";

test("starts at the largest avatar and reaches peak exactly at the goal", () => {
  assert.equal(stageFor(0, 8000), 0);
  assert.equal(stageFor(7999, 8000), 4);
  assert.equal(stageFor(8000, 8000), 5);
  assert.equal(stageFor(16000, 8000), 5);
});
test("quest rewards cannot be claimed early or twice", () => {
  let game = createGame("demo", "2026-09-17");
  assert.equal(claim(game, "peak").xp, 0);
  game = claim(setSteps(game, 8000, "2026-09-17"), "peak");
  assert.equal(game.xp, 250);
  assert.equal(claim(game, "peak").xp, 250);
});
test("midnight resets the avatar, retains rewards, archives once, and applies next goal", () => {
  let game = claim(
    setSteps(createGame("demo", "2026-09-17"), 8000, "2026-09-17"),
    "peak",
  );
  game = changeGoal(game, 10000);
  assert.equal(game.today.goal, 8000);
  game = rollover(game, "2026-09-18");
  assert.equal(game.today.steps, 0);
  assert.equal(game.today.goal, 10000);
  assert.equal(game.xp, 250);
  assert.equal(streak(game), 1);
  assert.equal(rollover(game, "2026-09-18").history.length, 1);
});
test("cumulative step refreshes replace totals instead of adding duplicate steps", () => {
  const game = setSteps(setSteps(createGame("ios-motion"), 1000), 1200);
  assert.equal(game.today.steps, 1200);
});
test("goal validation and corrupt saves fail safely; demo never becomes real progress", () => {
  assert.throws(() => changeGoal(createGame(), 0));
  assert.throws(() => setSteps(createGame(), NaN));
  assert.equal(restoreGame("{oops", "demo").today.steps, 0);
  assert.equal(
    restoreGame(JSON.stringify(setSteps(createGame(), 4000)), "ios-motion")
      .today.steps,
    0,
  );
});
test("missing days break streaks, and date revisits cannot repeat rewards", () => {
  let game = claim(
    setSteps(createGame("demo", "2026-09-15"), 8000, "2026-09-15"),
    "peak",
  );
  game = rollover(game, "2026-09-17");
  assert.equal(streak(game), 0);
  game = rollover(game, "2026-09-15");
  assert.equal(claim(game, "peak").xp, 250);
});

test("malformed history cannot crash a restored journal", () => {
  const game = createGame();
  (game.history as unknown[]).push(null);
  assert.equal(restoreGame(JSON.stringify(game), "demo").history.length, 0);
});
