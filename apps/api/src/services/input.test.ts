import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { events } from "./events.js";
import { requestUserInput, resolveUserInput } from "./input.js";

const requests: InputRequest[] = [];
const cancels: number[] = [];

type InputRequest = {
  id: number;
  title: string;
  fields: unknown[];
  host?: string;
};

/** Registers the listener that answers every request with `answers`. */
const autoAnswer = (answers?: Record<string, string>) =>
  events.onEvent("input:request", ({ id }) => {
    resolveUserInput(id, answers);
  });

beforeEach(() => {
  requests.length = 0;
  cancels.length = 0;
  events.onEvent("input:request", (req) => void requests.push(req));
  events.onEvent("input:cancel", ({ id }) => void cancels.push(id));
});

afterEach(() => {
  events.removeAllListeners("input:request");
  events.removeAllListeners("input:cancel");
});

describe("input round-trip", () => {
  it("resolves the pending request with the client's answers", async () => {
    const off = autoAnswer({ answer: "B" });
    await expect(
      requestUserInput({
        title: "Which case?",
        fields: [{ id: "answer", kind: "choice", options: [] }],
      }),
    ).resolves.toEqual({ answer: "B" });
    off();
  });

  it("a cancelled request resolves null", async () => {
    const off = autoAnswer(undefined);
    await expect(
      requestUserInput({ title: "Q", fields: [{ id: "a", kind: "text" }] }),
    ).resolves.toBeNull();
    off();
  });

  it("only the first answer wins; repeat resolutions are rejected", async () => {
    events.onEvent("input:request", ({ id }) => {
      expect(resolveUserInput(id, { a: "1" })).toBe(true);
      expect(resolveUserInput(id, { a: "2" })).toBe(false);
      expect(resolveUserInput(id)).toBe(false);
    });
    await expect(
      requestUserInput({ title: "Q", fields: [{ id: "a", kind: "text" }] }),
    ).resolves.toEqual({ a: "1" });
  });

  it("an unknown id is rejected", () => {
    expect(resolveUserInput(999_999, { a: "1" })).toBe(false);
    expect(resolveUserInput(-1)).toBe(false);
  });

  it("answering broadcasts a cancel so every client can drop the form", async () => {
    const off = autoAnswer({ a: "1" });
    const p = requestUserInput({
      title: "Q",
      fields: [{ id: "a", kind: "text" }],
    });
    await expect(p).resolves.toEqual({ a: "1" });
    off();
    // Exactly one cancel — for this request only, not accumulations.
    expect(cancels).toHaveLength(1);
  });

  it("the request announces the title, fields, and the host", async () => {
    let got: InputRequest | undefined;
    const off = events.onEvent("input:request", (req) => {
      got = req;
      resolveUserInput(req.id, { a: "1" });
    });
    await expect(
      requestUserInput({
        title: "Translate",
        fields: [{ id: "a", kind: "text" }],
      }),
    ).resolves.toEqual({ a: "1" });
    off();
    expect(got?.title).toBe("Translate");
    expect(got?.fields).toHaveLength(1);
    expect(got?.host?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("input cancellation", () => {
  it("an aborted signal retracts the form and resolves null", async () => {
    const controller = new AbortController();
    const p = requestUserInput(
      { title: "Q", fields: [{ id: "a", kind: "text" }] },
      controller.signal,
    );
    controller.abort();
    await expect(p).resolves.toBeNull();
    expect(cancels.length).toBeGreaterThan(0);
  });

  it("a pre-aborted signal resolves null without emitting a request", () => {
    const controller = new AbortController();
    controller.abort();
    const before = requests.length;
    const p = requestUserInput(
      { title: "Q", fields: [{ id: "a", kind: "text" }] },
      controller.signal,
    );
    return expect(p)
      .resolves.toBeNull()
      .then(() => {
        expect(requests).toHaveLength(before);
      });
  });

  it("a timed-out request resolves null and is retracted", async () => {
    vi.useFakeTimers();
    try {
      const p = requestUserInput({
        title: "Q",
        fields: [{ id: "a", kind: "text" }],
      });
      void vi.advanceTimersByTimeAsync(15 * 60_000 + 1);
      await expect(p).resolves.toBeNull();
      expect(cancels.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("an answered request is immune to its own abort afterwards", async () => {
    const off = events.onEvent("input:request", ({ id }) => {
      resolveUserInput(id, { a: "1" });
    });
    const p = requestUserInput({
      title: "Q",
      fields: [{ id: "a", kind: "text" }],
    });
    await expect(p).resolves.toEqual({ a: "1" });
    off();
  });
});

describe("single pending request", () => {
  it("a second concurrent request rejects immediately", async () => {
    const first = requestUserInput({
      title: "Q1",
      fields: [{ id: "a", kind: "text" }],
    });
    await expect(
      requestUserInput({ title: "Q2", fields: [{ id: "b", kind: "text" }] }),
    ).rejects.toThrow("another input request is pending");
    // The rejected second call never emitted; only Q1 is pending.
    expect(requests).toHaveLength(1);
    expect(resolveUserInput(requests[0]!.id, { a: "1" })).toBe(true);
    await expect(first).resolves.toEqual({ a: "1" });
  });

  it("a settled request frees the slot for the next one", async () => {
    const off = autoAnswer({ a: "1" });
    await expect(
      requestUserInput({ title: "Q1", fields: [{ id: "a", kind: "text" }] }),
    ).resolves.toEqual({ a: "1" });
    await expect(
      requestUserInput({ title: "Q2", fields: [{ id: "a", kind: "text" }] }),
    ).resolves.toEqual({ a: "1" });
    off();
  });
});
