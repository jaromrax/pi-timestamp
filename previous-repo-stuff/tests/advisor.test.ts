import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentSession, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import advisorExtension, {
  MAX_TOOL_CALL_ARGS_CHARS,
  MAX_TOOL_RESULT_CHARS,
  buildTranscript,
  getAdvisorCompletions,
  getAdvisorScopeChoices,
  parseSpec,
  renderEntry,
  resolveAdviseMode,
  showAdvisorFeedback,
  truncate,
  validateAdvisorConfig,
} from "../packages/pi-advisor/advisor.js";

test("parseSpec accepts provider/id and rejects malformed specs", () => {
  assert.deepEqual(parseSpec("openai/gpt-5"), { provider: "openai", id: "gpt-5" });
  assert.deepEqual(parseSpec("provider/model/with/slashes"), { provider: "provider", id: "model/with/slashes" });
  assert.equal(parseSpec("noslash"), undefined);
  assert.equal(parseSpec("/missing-provider"), undefined);
  assert.equal(parseSpec("missing-id/"), undefined);
});

test("validateAdvisorConfig keeps valid keys and ignores invalid keys", () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message?: unknown) => warnings.push(String(message));
  try {
    assert.deepEqual(
      validateAdvisorConfig({
        model: "openai/gpt-5",
        thinking: "xhigh",
        onDone: true,
        whenStuck: 3,
        timeoutMs: 0,
      }),
      { model: "openai/gpt-5", thinking: "xhigh", onDone: true, whenStuck: 3, timeoutMs: 0 },
    );

    assert.deepEqual(
      validateAdvisorConfig({
        model: 42,
        thinking: "extreme",
        onDone: "yes",
        whenStuck: -1,
        timeoutMs: 1.5,
      }),
      { thinking: "extreme" },
    );
    assert.ok(warnings.length >= 4);
  } finally {
    console.warn = originalWarn;
  }
});

test("truncate appends omitted character count", () => {
  assert.equal(truncate("abcdef", 10), "abcdef");
  assert.equal(truncate("abcdef", 3), "abc\n…[truncated 3 chars]");
});

test("renderEntry applies named truncation limits", () => {
  const longArg = "x".repeat(MAX_TOOL_CALL_ARGS_CHARS + 50);
  const assistant = renderEntry({
    type: "message",
    message: {
      role: "assistant",
      content: [{ type: "toolCall", name: "bash", arguments: { command: longArg } }],
    },
  });
  assert.match(assistant ?? "", /truncated/);

  const longResult = "y".repeat(MAX_TOOL_RESULT_CHARS + 10);
  const result = renderEntry({
    type: "message",
    message: {
      role: "toolResult",
      toolName: "bash",
      content: [{ type: "text", text: longResult }],
      isError: true,
    },
  });
  assert.match(result ?? "", /Result of `bash` \(error\)/);
  assert.match(result ?? "", /truncated 10 chars/);
});

test("buildTranscript drops oldest sections when context budget is exceeded", () => {
  const entries = ["one", "two", "three"].map((text) => ({
    type: "message",
    message: { role: "user", content: [{ type: "text", text: text.repeat(5000) }] },
  }));

  const transcript = buildTranscript(entries, { contextWindow: 5000, maxTokens: 1000 });
  assert.match(transcript, /earlier section\(s\) truncated/);
  assert.doesNotMatch(transcript, /oneoneone/);
  assert.match(transcript, /threethree/);
});

test("advisor completions include subcommands and require a cached reviewer model for thinking levels", () => {
  const firstToken = getAdvisorCompletions("on") ?? [];
  assert.deepEqual(firstToken.find((item) => item.label === "on-done"), {
    value: "on-done",
    label: "on-done",
    description: "Toggle automatic review when the agent finishes",
  });

  // No levels are offered for an unknown model: levels come from Pi's cached,
  // model-specific capabilities rather than a local static list.
  assert.deepEqual(getAdvisorCompletions("kapper-ai/Anthropic.claude-opus-4-8 "), []);

  const onDone = getAdvisorCompletions("on-done ") ?? [];
  assert.deepEqual(onDone.find((item) => item.label === "on"), { value: "on-done on", label: "on" });

  const whenStuck = getAdvisorCompletions("when-stuck ") ?? [];
  assert.deepEqual(whenStuck.find((item) => item.label === "1"), { value: "when-stuck 1", label: "1" });
});

test("advisor registers onDone after settlement and writes project config atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-advisor-config-"));
  const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<unknown> }>();
  let activeTools = ["advisor"];
  const pi = {
    on(event: string, handler: (event: any, ctx: any) => unknown) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerCommand(name: string, command: { handler: (args: string, ctx: any) => Promise<unknown> }) {
      commands.set(name, command);
    },
    registerTool() {},
    registerMessageRenderer() {},
    getActiveTools: () => activeTools,
    setActiveTools: (tools: string[]) => { activeTools = tools; },
  } as unknown as ExtensionAPI;
  advisorExtension(pi);

  assert.equal(handlers.has("agent_end"), false);
  assert.equal(handlers.has("agent_settled"), true);

  const ctx = {
    cwd: directory,
    hasUI: true,
    isProjectTrusted: () => true,
    modelRegistry: { refresh: () => {}, getAvailable: () => [] },
    ui: {
      select: async () => "This folder (project)",
      notify: () => {},
    },
  };

  try {
    const advisor = commands.get("advisor");
    assert.ok(advisor);
    await advisor.handler("on-done on", ctx);
    await advisor.handler("on-done off", ctx); // replace an existing file

    const configDirectory = join(directory, ".pi");
    assert.deepEqual(await readdir(configDirectory), ["advisor.json"]);
    const configFile = join(configDirectory, "advisor.json");
    assert.deepEqual(JSON.parse(await readFile(configFile, "utf8")), { onDone: false });
    if (process.platform !== "win32") assert.equal((await stat(configFile)).mode & 0o077, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("advisor only offers global configuration for untrusted projects", () => {
  assert.deepEqual(getAdvisorScopeChoices(false), ["Global (all projects)"]);
  assert.deepEqual(getAdvisorScopeChoices(true), ["This folder (project)", "Global (all projects)"]);
});

test("resolveAdviseMode defaults to pipe when idle and steer when running", () => {
  assert.equal(resolveAdviseMode("", true), "pipe");
  assert.equal(resolveAdviseMode(undefined, false), "steer");
  assert.equal(resolveAdviseMode("show", false), "show");
  assert.equal(resolveAdviseMode(" pipe ", false), "pipe");
  assert.equal(resolveAdviseMode("bogus", true), undefined);
});

test("advisor non-triggering feedback is deferred while streaming", async () => {
  const order: string[] = [];
  const session = {
    isStreaming: true,
    _pendingNextTurnMessages: [],
    _pendingCustomMessages: [],
    _appendCustomMessage(message: { customType: string }) { order.push(message.customType); },
  };
  const agentSessionPrototype = AgentSession.prototype as unknown as {
    sendCustomMessage: Function;
    _flushPendingCustomMessages: Function;
  };
  const pi = {
    sendMessage(message: unknown, options: unknown) {
      return agentSessionPrototype.sendCustomMessage.call(session, message, options);
    },
  } as Pick<ExtensionAPI, "sendMessage">;

  showAdvisorFeedback(pi, "review");
  await Promise.resolve();
  assert.equal(session._pendingCustomMessages.length, 1);
  assert.equal(order.length, 0);

  // AgentSession flushes non-triggering messages only after its turn_end event,
  // when the assistant's tool results have already been recorded.
  order.push("toolResult");
  agentSessionPrototype._flushPendingCustomMessages.call(session);
  assert.deepEqual(order, ["toolResult", "advisor"]);
});
