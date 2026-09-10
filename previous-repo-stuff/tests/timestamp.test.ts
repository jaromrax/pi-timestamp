import test from "node:test";
import assert from "node:assert/strict";
import timestampExtension, {
  beginSession,
  beginTask,
  beginUserPromptWait,
  createRuntimeState,
  createTaskTimingState,
  endUserPromptWait,
  finishSession,
  finishTask,
  formatRuntimeDuration,
  takePendingSessionSummary,
} from "../packages/pi-timestamp/timestamp.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

test("formatRuntimeDuration formats seconds through weeks", () => {
  assert.equal(formatRuntimeDuration(0), "0s");
  assert.equal(formatRuntimeDuration(42_000), "42s");
  assert.equal(formatRuntimeDuration(3_661_000), "1h 1m 1s");
  assert.equal(formatRuntimeDuration(172_805_000), "2d 5s");
  assert.equal(formatRuntimeDuration(788_645_000), "1w 2d 3h 4m 5s");
});

test("task timing separates active work from prompt waits and ignores stray events", () => {
  const timing = createTaskTimingState();
  endUserPromptWait(timing, 500); // stray end before a task
  beginUserPromptWait(timing, 500); // stray start before a task
  beginTask(timing, 1_000);
  beginTask(timing, 1_500); // retry must retain the original start
  beginUserPromptWait(timing, 2_000);
  beginUserPromptWait(timing, 2_500); // Nested start retains the outer start time.
  endUserPromptWait(timing, 4_000); // Inner end keeps the prompt span open.
  endUserPromptWait(timing, 4_000); // Outer end closes the span.
  endUserPromptWait(timing, 4_500); // stray duplicate end
  beginUserPromptWait(timing, 5_000);
  endUserPromptWait(timing, 6_000);

  assert.deepEqual(finishTask(timing, 7_000), {
    totalMs: 6_000,
    activeMs: 3_000,
    waitingForUserMs: 3_000,
  });
  assert.equal(finishTask(timing, 8_000), undefined);
});

test("timestamp waits for agent settlement and retains the first retry start", async () => {
  const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
  const notifications: string[] = [];
  const pi = {
    on(event: string, handler: (event: any, ctx: any) => unknown) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
  } as unknown as ExtensionAPI;
  timestampExtension(pi);

  assert.equal(handlers.has("agent_end"), false);
  assert.equal(handlers.has("agent_settled"), true);

  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  const ctx = { ui: { notify: (message: string) => notifications.push(message) } };
  const emit = async (event: string) => {
    for (const handler of handlers.get(event) ?? []) await handler({ type: event }, ctx);
  };

  try {
    await emit("agent_start");
    now = 2_000;
    await emit("agent_start"); // automatic retry must not reset the timer
    now = 4_000;
    await emit("agent_settled");
    assert.equal(notifications.length, 1);
    assert.match(notifications[0] ?? "", /^Done at \d{2}:\d{2}:\d{2} · 3\.0s$/);
  } finally {
    Date.now = originalNow;
  }
});

test("timestamp reports total, active, and waiting time for UI prompts", async () => {
  const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
  const notifications: string[] = [];
  const pi = {
    on(event: string, handler: (event: any, ctx: any) => unknown) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
  } as unknown as ExtensionAPI;
  timestampExtension(pi);

  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  const ctx = { ui: { notify: (message: string) => notifications.push(message) } };
  const emit = async (event: string) => {
    for (const handler of handlers.get(event) ?? []) await handler({ type: event }, ctx);
  };

  try {
    await emit("agent_start");
    now = 2_000;
    await emit("ui_prompt_start");
    now = 5_000;
    await emit("ui_prompt_end");
    now = 7_000;
    await emit("agent_settled");
    assert.match(notifications[0] ?? "", /^Done at \d{2}:\d{2}:\d{2} · total 6\.0s · active 3\.0s · waiting 3\.0s$/);
  } finally {
    Date.now = originalNow;
  }
});

test("session runtime state keeps reloads open and finalizes each session once", () => {
  const state = createRuntimeState(1_000);

  assert.equal(beginSession(state, "first", 2_000), true);
  assert.equal(beginSession(state, "first", 3_000), false); // /reload
  assert.equal(state.activeSession?.startedAt, 2_000);

  assert.deepEqual(finishSession(state, 5_000), { id: "first", startedAt: 2_000, endedAt: 5_000 });
  assert.equal(finishSession(state, 6_000), undefined); // final quit must not duplicate it

  assert.equal(beginSession(state, "second", 7_000), true);
  assert.deepEqual(finishSession(state, 11_000), { id: "second", startedAt: 7_000, endedAt: 11_000 });
  assert.deepEqual(state.completedSessions, [
    { id: "first", startedAt: 2_000, endedAt: 5_000 },
    { id: "second", startedAt: 7_000, endedAt: 11_000 },
  ]);

  state.pendingSessionSummary = state.completedSessions[0];
  assert.deepEqual(takePendingSessionSummary(state), { id: "first", startedAt: 2_000, endedAt: 5_000 });
  assert.equal(takePendingSessionSummary(state), undefined);
});
