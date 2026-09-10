import test from "node:test";
import assert from "node:assert/strict";
import thinkingShortcutExtension, {
  getThinkingLevelCompletions,
  isThinkingCommandPrefix,
  normalizeThinkingLevel,
} from "../packages/pi-thinking-command/thinking-shortcut.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

test("thinking command uses the active model's supported levels", () => {
  const supported = ["off", "low", "high", "max"] as const;
  assert.equal(normalizeThinkingLevel(" MAX ", supported), "max");
  assert.equal(normalizeThinkingLevel("medium", supported), undefined);
  assert.equal(normalizeThinkingLevel("invalid", supported), undefined);
  assert.deepEqual(getThinkingLevelCompletions("", supported)?.map((item) => item.value), supported);
  assert.deepEqual(getThinkingLevelCompletions("ma", supported)?.map((item) => item.value), ["max"]);
});

test("thinking extension refreshes capabilities and exercises command/autocomplete behavior", async () => {
  const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
  let commandName: string | undefined;
  let command: {
    getArgumentCompletions?: (prefix: string) => Array<{ value: string }> | null;
    handler: (args: string, ctx: any) => Promise<void>;
  } | undefined;
  let autocompleteWrapper: ((current: any) => any) | undefined;
  let thinkingLevel = "high";
  const notifications: string[] = [];
  const pi = {
    on(event: string, handler: (event: any, ctx: any) => unknown) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerCommand(name: string, value: typeof command) {
      commandName = name;
      command = value;
    },
    getThinkingLevel: () => thinkingLevel,
    setThinkingLevel: (level: string) => { thinkingLevel = level; },
  } as unknown as ExtensionAPI;
  thinkingShortcutExtension(pi);

  const model = { reasoning: true, thinkingLevelMap: { xhigh: null, max: "max" } };
  const ctx = {
    model,
    ui: {
      addAutocompleteProvider: (wrapper: (current: any) => any) => { autocompleteWrapper = wrapper; },
      setStatus: () => {},
      notify: (message: string) => notifications.push(message),
    },
  };
  for (const handler of handlers.get("session_start") ?? []) {
    await handler({ type: "session_start", reason: "startup" }, ctx);
  }

  assert.equal(commandName, "think");
  assert.deepEqual(
    command?.getArgumentCompletions?.("")?.map((item) => item.value),
    ["off", "minimal", "low", "medium", "high", "max"],
  );

  assert.ok(command);
  await command.handler("", ctx);
  assert.equal(thinkingLevel, "medium");
  await command.handler("xhigh", ctx);
  assert.equal(thinkingLevel, "medium");
  assert.match(notifications.at(-1) ?? "", /not supported/);

  let delegatedSuggestions = 0;
  const baseProvider = {
    getSuggestions: async () => { delegatedSuggestions++; return null; },
    applyCompletion: () => { throw new Error("unexpected base completion"); },
    shouldTriggerFileCompletion: () => true,
  };
  assert.ok(autocompleteWrapper);
  const provider = autocompleteWrapper(baseProvider);
  const commandSuggestion = await provider.getSuggestions(["/th"], 0, 3, {});
  const completedCommand = provider.applyCompletion(["/th"], 0, 3, commandSuggestion.items[0], commandSuggestion.prefix);
  assert.deepEqual(completedCommand, { lines: ["/think"], cursorLine: 0, cursorCol: 6 });

  const levelSuggestion = await provider.getSuggestions(["/think"], 0, 6, {});
  const low = levelSuggestion.items.find((item: { value: string }) => item.value === "low");
  const completedLevel = provider.applyCompletion(["/think"], 0, 6, low, levelSuggestion.prefix);
  assert.deepEqual(completedLevel, { lines: ["/think low"], cursorLine: 0, cursorCol: 10 });

  assert.equal(await provider.getSuggestions(["/think xyz trailing"], 0, 10, {}), null);
  assert.equal(delegatedSuggestions, 1, "mid-line completion must delegate to Pi's base provider");

  const malformedModel = {
    reasoning: true,
    thinkingLevelMap: { off: null, minimal: null, low: null, medium: null, high: null, xhigh: null, max: null },
  };
  for (const handler of handlers.get("model_select") ?? []) {
    await handler({ type: "model_select", model: malformedModel }, ctx);
  }
  assert.deepEqual(command.getArgumentCompletions?.("")?.map((item) => item.value), ["off"]);
});

test("thinking autocomplete intercepts /think prefixes without taking over Pi's /thinking", () => {
  assert.equal(isThinkingCommandPrefix("/th"), true);
  assert.equal(isThinkingCommandPrefix("/think"), true);
  assert.equal(isThinkingCommandPrefix("/thinking"), false);
  assert.equal(isThinkingCommandPrefix("/theme"), false);
});
