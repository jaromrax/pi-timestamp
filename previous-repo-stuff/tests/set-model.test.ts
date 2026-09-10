import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import setModelExtension, {
  ACTIONS,
  getActionCompletions,
  isSetModelCommandPrefix,
  loadPreference,
  savePreference,
} from "../packages/pi-set-model/set-model.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

test("set-model autocomplete exposes only view, set, and clear", () => {
  assert.equal(isSetModelCommandPrefix("/setm"), true);
  assert.equal(isSetModelCommandPrefix("/set-model"), true);
  assert.equal(isSetModelCommandPrefix("/set"), false);
  assert.deepEqual(ACTIONS.map((action) => action.value), ["view", "set", "clear"]);
  assert.deepEqual(getActionCompletions("c")?.map((item) => item.value), ["clear"]);
});

test("set-model rejects malformed or empty preferences", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-set-model-invalid-"));
  const preferenceFile = join(directory, ".pi", "set-model.json");
  const originalError = console.error;
  console.error = () => {};
  try {
    await savePreference(preferenceFile, { provider: "", model: "test-model", thinkingLevel: "high" });
    assert.equal(await loadPreference(preferenceFile), undefined);
  } finally {
    console.error = originalError;
    await rm(directory, { recursive: true, force: true });
  }
});

test("set-model ignores project preferences until the project is trusted", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-set-model-untrusted-"));
  const preferenceFile = join(directory, ".pi", "set-model.json");
  await savePreference(preferenceFile, { provider: "test-provider", model: "test-model", thinkingLevel: "high" });

  const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
  let setModelCalls = 0;
  const pi = {
    on(event: string, handler: (event: any, ctx: any) => unknown) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerCommand() {},
    getThinkingLevel: () => "off",
    setThinkingLevel() {},
    setModel: async () => { setModelCalls++; return true; },
  } as unknown as ExtensionAPI;
  setModelExtension(pi);

  const ctx = {
    cwd: directory,
    model: { provider: "previous", id: "previous-model" },
    isProjectTrusted: () => false,
    modelRegistry: { find: () => { throw new Error("untrusted project preference must not be read"); } },
    ui: { addAutocompleteProvider: () => {}, notify: () => {}, theme: { fg: (_color: string, message: string) => message } },
  };

  try {
    for (const handler of handlers.get("session_start") ?? []) {
      await handler({ type: "session_start", reason: "startup" }, ctx);
    }
    assert.equal(setModelCalls, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("set-model clamps a saved thinking level to the restored model", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-set-model-restore-"));
  const preferenceFile = join(directory, ".pi", "set-model.json");
  await savePreference(preferenceFile, { provider: "test-provider", model: "test-model", thinkingLevel: "max" });

  const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
  const notifications: string[] = [];
  let thinkingLevel = "off";
  const pi = {
    on(event: string, handler: (event: any, ctx: any) => unknown) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerCommand() {},
    getThinkingLevel: () => thinkingLevel,
    setThinkingLevel: (level: string) => { thinkingLevel = level; },
    setModel: async () => true,
  } as unknown as ExtensionAPI;
  setModelExtension(pi);

  const savedModel = {
    provider: "test-provider",
    id: "test-model",
    reasoning: true,
    thinkingLevelMap: { xhigh: null, max: null },
  };
  const ctx = {
    cwd: directory,
    model: { provider: "previous", id: "previous-model" },
    isProjectTrusted: () => true,
    modelRegistry: { find: () => savedModel },
    ui: {
      addAutocompleteProvider: () => {},
      notify: (message: string) => notifications.push(message),
      theme: { fg: (_color: string, message: string) => message },
    },
  };

  try {
    for (const handler of handlers.get("session_start") ?? []) {
      await handler({ type: "session_start", reason: "startup" }, ctx);
    }
    assert.equal(thinkingLevel, "high");
    assert.match(notifications[0] ?? "", /saved level max is unsupported/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("set-model keeps a saved preference in sync with thinking changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-set-model-thinking-change-"));
  const preferenceFile = join(directory, ".pi", "set-model.json");
  await savePreference(preferenceFile, { provider: "test-provider", model: "test-model", thinkingLevel: "high" });

  const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
  let thinkingLevel = "off";
  const pi = {
    on(event: string, handler: (event: any, ctx: any) => unknown) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerCommand() {},
    getThinkingLevel: () => thinkingLevel,
    setThinkingLevel: (level: string) => { thinkingLevel = level; },
    setModel: async () => true,
  } as unknown as ExtensionAPI;
  setModelExtension(pi);

  const model = { provider: "test-provider", id: "test-model", reasoning: true };
  const ctx = {
    cwd: directory,
    model,
    isProjectTrusted: () => true,
    modelRegistry: { find: () => model },
    ui: {
      addAutocompleteProvider: () => {},
      notify: () => {},
      theme: { fg: (_color: string, message: string) => message },
    },
  };

  try {
    for (const handler of handlers.get("session_start") ?? []) {
      await handler({ type: "session_start", reason: "startup" }, ctx);
    }
    for (const handler of handlers.get("thinking_level_select") ?? []) {
      await handler({ type: "thinking_level_select", level: "medium", previousLevel: "high" }, ctx);
    }
    assert.deepEqual(await loadPreference(preferenceFile), {
      provider: "test-provider",
      model: "test-model",
      thinkingLevel: "medium",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("set-model does not save thinking changes caused by shutdown restoration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-set-model-shutdown-"));
  const preferenceFile = join(directory, ".pi", "set-model.json");
  await savePreference(preferenceFile, { provider: "test-provider", model: "test-model", thinkingLevel: "high" });

  const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
  let thinkingLevel = "medium";
  const pi = {
    on(event: string, handler: (event: any, ctx: any) => unknown) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerCommand() {},
    getThinkingLevel: () => thinkingLevel,
    setThinkingLevel: (level: string) => { thinkingLevel = level; },
    setModel: async () => true,
  } as unknown as ExtensionAPI;
  setModelExtension(pi);

  const model = { provider: "test-provider", id: "test-model", reasoning: true };
  const ctx = {
    cwd: directory,
    model,
    isProjectTrusted: () => true,
    modelRegistry: { find: () => model },
    ui: {
      addAutocompleteProvider: () => {},
      notify: () => {},
      theme: { fg: (_color: string, message: string) => message },
    },
  };

  try {
    for (const handler of handlers.get("session_start") ?? []) {
      await handler({ type: "session_start", reason: "startup" }, ctx);
    }
    for (const handler of handlers.get("session_shutdown") ?? []) {
      await handler({ type: "session_shutdown", reason: "quit" }, ctx);
    }
    for (const handler of handlers.get("thinking_level_select") ?? []) {
      await handler({ type: "thinking_level_select", level: "medium", previousLevel: "high" }, ctx);
    }
    assert.equal((await loadPreference(preferenceFile))?.thinkingLevel, "high");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("set-model preferences persist locally and can be read back", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-set-model-"));
  const preferenceFile = join(directory, ".pi", "set-model.json");
  const preference = { provider: "test-provider", model: "test-model", thinkingLevel: "high" as const };
  try {
    await savePreference(preferenceFile, preference);
    assert.deepEqual(await loadPreference(preferenceFile), preference);
    assert.match(await readFile(preferenceFile, "utf8"), /test-model/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("set-model saves concurrent preferences through private, cleaned-up temporary files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-set-model-atomic-"));
  const preferenceFile = join(directory, ".pi", "set-model.json");
  const preferences = Array.from({ length: 12 }, (_, index) => ({
    provider: "test-provider",
    model: `test-model-${index}`,
    thinkingLevel: "high" as const,
  }));
  try {
    await Promise.all(preferences.map((preference) => savePreference(preferenceFile, preference)));
    const saved = await loadPreference(preferenceFile);
    assert.ok(preferences.some((preference) => JSON.stringify(preference) === JSON.stringify(saved)));
    assert.deepEqual(await readdir(join(directory, ".pi")), ["set-model.json"]);
    if (process.platform !== "win32") assert.equal((await stat(preferenceFile)).mode & 0o077, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
