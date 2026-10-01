import { beforeEach, describe, expect, it, vi } from "vitest";
import type { INotifyPayload } from "./notify.js";

const mocks = vi.hoisted(() => ({
  notificationSummary:
    vi.fn<(content: string, chatId: number | null) => Promise<string | null>>(),
}));

vi.mock("./notifyText.js", () => ({
  notificationSummary: mocks.notificationSummary,
}));

const { maybeNotify } = await import("./notify.js");

const NOW = 1_800_000_000_000;
const SLOW_TURN_STARTED_AT = NOW - 30_000;
const SLOW_REPLY = `Here is the plan.\n\n${"The daemon writes each frame to the transcript. ".repeat(6)}`;
const SHORT_REPLY = "Done — the migration ran and every row survived.";

const captured = () => {
  const seen: INotifyPayload[] = [];
  return {
    seen,
    emit: (payload: INotifyPayload) => void seen.push(payload),
  };
};

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  mocks.notificationSummary.mockReset();
  mocks.notificationSummary.mockResolvedValue(
    "Daemon frames land in the transcript.",
  );
});

describe("maybeNotify", () => {
  it("stays quiet for a reply the user watched stream in", async () => {
    const { seen, emit } = captured();

    await maybeNotify({
      startedAt: NOW - 500,
      content: SLOW_REPLY,
      chatId: 7,
      emit,
    });

    expect(seen).toHaveLength(0);
    expect(mocks.notificationSummary).not.toHaveBeenCalled();
  });

  it("asks for a summary of a long reply and sends it with the chat", async () => {
    const { seen, emit } = captured();

    await maybeNotify({
      startedAt: SLOW_TURN_STARTED_AT,
      content: SLOW_REPLY,
      chatId: 7,
      emit,
    });

    expect(mocks.notificationSummary).toHaveBeenCalledWith(SLOW_REPLY, 7);
    expect(seen).toEqual([
      {
        title: "Kotys",
        body: "Daemon frames land in the transcript.",
        chatId: 7,
      },
    ]);
  });

  it("keeps the model's sentence readable as one banner line", async () => {
    mocks.notificationSummary.mockResolvedValue(
      "## Fixed:\n- **tests** pass, `lint` clean, and the daemon restarts cleanly on every boot of the app",
    );
    const { seen, emit } = captured();

    await maybeNotify({
      startedAt: SLOW_TURN_STARTED_AT,
      content: SLOW_REPLY,
      chatId: 7,
      emit,
    });

    expect(seen[0].body).toBe(
      "Fixed: tests pass, lint clean, and the daemon restarts cleanly on every boot of the app",
    );
  });

  it("cuts a long summary on a word boundary", async () => {
    mocks.notificationSummary.mockResolvedValue(
      `${"The daemon now writes every chat frame straight to the transcript. ".repeat(4)}`,
    );
    const { seen, emit } = captured();

    await maybeNotify({
      startedAt: SLOW_TURN_STARTED_AT,
      content: SLOW_REPLY,
      chatId: 7,
      emit,
    });

    expect(seen[0].body).toBe(
      "The daemon now writes every chat frame straight to the transcript. The daemon now writes every chat frame straight to the transcript. The…",
    );
  });

  it("does not spend a model call on a reply shorter than a banner", async () => {
    const { seen, emit } = captured();

    await maybeNotify({
      startedAt: SLOW_TURN_STARTED_AT,
      content: SHORT_REPLY,
      chatId: 7,
      emit,
    });

    expect(mocks.notificationSummary).not.toHaveBeenCalled();
    expect(seen[0].body).toBe(SHORT_REPLY);
  });

  it("falls back to the reply's opening words when the summary fails", async () => {
    mocks.notificationSummary.mockRejectedValue(new Error("no model"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { seen, emit } = captured();

    await maybeNotify({
      startedAt: SLOW_TURN_STARTED_AT,
      content: SLOW_REPLY,
      chatId: 7,
      emit,
    });

    expect(seen[0].body).toBe(
      "Here is the plan. The daemon writes each frame to the transcript. The daemon writes each frame to the transcript. The…",
    );
    expect(warn).toHaveBeenCalled();
  });

  it("falls back when the model answered without the tagged sentence", async () => {
    mocks.notificationSummary.mockResolvedValue(null);
    const { seen, emit } = captured();

    await maybeNotify({
      startedAt: SLOW_TURN_STARTED_AT,
      content: SLOW_REPLY,
      chatId: 7,
      emit,
    });

    expect(seen[0].body).toBe(
      "Here is the plan. The daemon writes each frame to the transcript. The daemon writes each frame to the transcript. The…",
    );
  });

  it("still notifies a turn with no chat row, without a chatId", async () => {
    const { seen, emit } = captured();

    await maybeNotify({
      startedAt: SLOW_TURN_STARTED_AT,
      content: SLOW_REPLY,
      chatId: null,
      emit,
    });

    expect(mocks.notificationSummary).toHaveBeenCalledWith(SLOW_REPLY, null);
    expect(seen[0]).toEqual({
      title: "Kotys",
      body: "Daemon frames land in the transcript.",
    });
  });

  it("says something even when the turn produced no text", async () => {
    const { seen, emit } = captured();

    await maybeNotify({
      startedAt: SLOW_TURN_STARTED_AT,
      content: "   \n  ",
      chatId: 7,
      emit,
    });

    expect(mocks.notificationSummary).not.toHaveBeenCalled();
    expect(seen).toEqual([
      { title: "Kotys", body: "New response ready", chatId: 7 },
    ]);
  });
});
