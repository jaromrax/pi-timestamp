// Copyright © 2026 kapper.net - KAPPER NETWORK-COMMUNICATIONS GmbH
// SPDX-License-Identifier: EUPL-1.2

/**
 * Timestamp Extension
 *
 * Displays timestamps for user input and agent completion timing.
 * All timestamps are display-only — they never enter the LLM context.
 *
 * - Shows `Sent HH:MM:SS` after each user message in the chat UI
 * - Shows `Done at HH:MM:SS · duration` after each agent turn in the chat UI
 * - Summarizes completed sessions and the complete Pi process runtime
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface SessionInterval {
    id: string;
    startedAt: number;
    endedAt: number;
}

export interface TimestampRuntimeState {
    processStartedAt: number;
    activeSession: { id: string; startedAt: number } | undefined;
    completedSessions: SessionInterval[];
    pendingSessionSummary: SessionInterval | undefined;
}

export interface TaskTimingState {
    startedAt: number | undefined;
    promptStartedAt: number | undefined;
    promptDepth: number;
    waitingForUserMs: number;
}

export interface CompletedTaskTiming {
    totalMs: number;
    activeMs: number;
    waitingForUserMs: number;
}

const RUNTIME_STATE_KEY = Symbol.for("hknet.pi-timestamp.runtime-state");

export function createRuntimeState(processStartedAt: number): TimestampRuntimeState {
    return { processStartedAt, activeSession: undefined, completedSessions: [], pendingSessionSummary: undefined };
}

function getRuntimeState(): TimestampRuntimeState {
    const globalStore = globalThis as Record<symbol, unknown>;
    const existing = globalStore[RUNTIME_STATE_KEY];
    if (existing && typeof existing === "object") return existing as TimestampRuntimeState;

    // The extension can load after Pi has initialized. Anchor the summary to the
    // Node process start rather than the extension load time.
    const state = createRuntimeState(Date.now() - process.uptime() * 1000);
    globalStore[RUNTIME_STATE_KEY] = state;
    return state;
}

export function beginSession(state: TimestampRuntimeState, id: string, startedAt: number): boolean {
    if (state.activeSession?.id === id) return false;
    state.activeSession = { id, startedAt };
    return true;
}

export function finishSession(state: TimestampRuntimeState, endedAt: number): SessionInterval | undefined {
    const active = state.activeSession;
    if (!active) return undefined;

    const interval = { ...active, endedAt };
    state.completedSessions.push(interval);
    state.activeSession = undefined;
    return interval;
}

export function takePendingSessionSummary(state: TimestampRuntimeState): SessionInterval | undefined {
    const pending = state.pendingSessionSummary;
    state.pendingSessionSummary = undefined;
    return pending;
}

export function createTaskTimingState(): TaskTimingState {
    return { startedAt: undefined, promptStartedAt: undefined, promptDepth: 0, waitingForUserMs: 0 };
}

export function beginTask(state: TaskTimingState, now: number): void {
    if (state.startedAt !== undefined) return;
    state.startedAt = now;
    state.promptStartedAt = undefined;
    state.promptDepth = 0;
    state.waitingForUserMs = 0;
}

export function beginUserPromptWait(state: TaskTimingState, now: number): void {
    if (state.startedAt === undefined) return;
    if (state.promptDepth++ === 0) state.promptStartedAt = now;
}

export function endUserPromptWait(state: TaskTimingState, now: number): void {
    if (state.promptDepth === 0) return;
    if (--state.promptDepth !== 0 || state.promptStartedAt === undefined) return;
    state.waitingForUserMs += Math.max(0, now - state.promptStartedAt);
    state.promptStartedAt = undefined;
}

export function finishTask(state: TaskTimingState, now: number): CompletedTaskTiming | undefined {
    if (state.startedAt === undefined) return undefined;
    if (state.promptDepth > 0 && state.promptStartedAt !== undefined) {
        state.waitingForUserMs += Math.max(0, now - state.promptStartedAt);
        state.promptStartedAt = undefined;
        state.promptDepth = 0;
    }
    const totalMs = Math.max(0, now - state.startedAt);
    const completed = {
        totalMs,
        waitingForUserMs: Math.min(totalMs, state.waitingForUserMs),
        activeMs: 0,
    };
    completed.activeMs = totalMs - completed.waitingForUserMs;
    state.startedAt = undefined;
    state.promptDepth = 0;
    state.waitingForUserMs = 0;
    return completed;
}

function formatTime(ts: number): string {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
}

function formatDateTime(ts: number): string {
    const d = new Date(ts);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${formatTime(ts)}`;
}

function isSameLocalDate(left: number, right: number): boolean {
    const a = new Date(left);
    const b = new Date(right);
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatSessionRange(session: SessionInterval): string {
    if (isSameLocalDate(session.startedAt, session.endedAt)) {
        return `${formatTime(session.startedAt)}–${formatTime(session.endedAt)}`;
    }
    return `${formatDateTime(session.startedAt)} → ${formatDateTime(session.endedAt)}`;
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const totalSecs = ms / 1000;
    if (totalSecs < 60) return `${totalSecs.toFixed(1)}s`;
    const totalMins = totalSecs / 60;
    if (totalMins < 60) {
        const m = Math.floor(totalMins);
        const s = (totalSecs % 60).toFixed(1);
        return `${m}m ${s}s`;
    }
    const hrs = totalMins / 60;
    return `${Math.floor(hrs)}h ${Math.floor(totalMins % 60)}m`;
}

export function formatRuntimeDuration(ms: number): string {
    let remainingSeconds = Math.max(0, Math.floor(ms / 1000));
    const weeks = Math.floor(remainingSeconds / (7 * 24 * 60 * 60));
    remainingSeconds %= 7 * 24 * 60 * 60;
    const days = Math.floor(remainingSeconds / (24 * 60 * 60));
    remainingSeconds %= 24 * 60 * 60;
    const hours = Math.floor(remainingSeconds / (60 * 60));
    remainingSeconds %= 60 * 60;
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    const parts = [
        weeks > 0 ? `${weeks}w` : undefined,
        days > 0 ? `${days}d` : undefined,
        hours > 0 ? `${hours}h` : undefined,
        minutes > 0 ? `${minutes}m` : undefined,
        `${seconds}s`,
    ];
    return parts.filter((part): part is string => part !== undefined).join(" ");
}

export default function (pi: ExtensionAPI) {
    const taskTiming = createTaskTimingState();

    function notifyAccent(ctx: ExtensionContext, message: string): void {
        ctx.ui.notify(ctx.ui.theme.fg("accent", message), "info");
    }

    // Track the complete run. Automatic retries and compaction recovery can emit
    // additional agent_start events before agent_settled, so retain the first start.
    pi.on("agent_start", async () => {
        beginTask(taskTiming, Date.now());
    });

    // Pi coalesces nested UI prompts. Track only prompt spans that overlap an
    // active agent run, so configuration dialogs while idle do not affect timing.
    pi.on("ui_prompt_start", async () => {
        beginUserPromptWait(taskTiming, Date.now());
    });

    pi.on("ui_prompt_end", async () => {
        endUserPromptWait(taskTiming, Date.now());
    });

    // Show "Sent HH:MM:SS" after each user message.
    // notify(..., "info") renders a display-only status line in the TUI chat; it is not
    // appended to the session and does not enter the LLM context.
    pi.on("message_end", async (event, ctx) => {
        if (event.message.role !== "user") return;

        const ts = event.message.timestamp;
        if (!ts) return;

        ctx.ui.notify(`Sent ${formatTime(ts)}`, "info");
    });

    // Show completion timing only after retries, compaction recovery, and queued
    // continuations have fully settled.
    pi.on("agent_settled", async (_event, ctx) => {
        const endTime = Date.now();
        const timing = finishTask(taskTiming, endTime);
        if (!timing) return;

        const total = formatDuration(timing.totalMs);
        const detail = timing.waitingForUserMs > 0
            ? ` · active ${formatDuration(timing.activeMs)} · waiting ${formatDuration(timing.waitingForUserMs)}`
            : "";
        ctx.ui.notify(`Done at ${formatTime(endTime)} · ${timing.waitingForUserMs > 0 ? `total ${total}` : total}${detail}`, "info");
    });

    pi.on("session_start", (_event, ctx) => {
        const state = getRuntimeState();
        const previousSession = takePendingSessionSummary(state);
        if (previousSession) {
            notifyAccent(
                ctx,
                `Previous session complete · ${formatSessionRange(previousSession)} · ${formatRuntimeDuration(previousSession.endedAt - previousSession.startedAt)}`,
            );
        }

        const sessionId = ctx.sessionManager.getSessionId();
        // A reload rebinds the extension to the same session. Keep its timer running.
        beginSession(state, sessionId, Date.now());
    });

    pi.on("session_shutdown", (event, ctx) => {
        // Reload replaces the extension runtime but not the Pi session.
        if (event.reason === "reload") return;

        const endTime = Date.now();
        const interval = finishSession(getRuntimeState(), endTime);

        if (event.reason !== "quit") {
            if (interval) getRuntimeState().pendingSessionSummary = interval;
            return;
        }

        const state = getRuntimeState();
        const sessionRows = state.completedSessions.map(
            (session, index) =>
                `  ${index + 1}. ${formatSessionRange(session)} · ${formatRuntimeDuration(session.endedAt - session.startedAt)}`,
        );
        // On normal Ctrl+D shutdown Pi has already stopped the TUI, so ui.notify()
        // cannot render. Write after terminal restoration instead.
        const summary = [
            "Pi runtime complete",
            `  Started: ${formatDateTime(state.processStartedAt)}`,
            `  Ended:   ${formatDateTime(endTime)}`,
            `  Total:   ${formatRuntimeDuration(endTime - state.processStartedAt)}`,
            ...(sessionRows.length > 0 ? ["  Sessions:", ...sessionRows] : []),
        ].join("\n");
        if (ctx.mode === "tui") {
            process.stdout.write(`${ctx.ui.theme.fg("accent", summary)}\n`);
        }
    });
}
