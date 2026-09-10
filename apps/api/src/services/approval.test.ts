import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { events } from "./events.js";
import { requestApproval, resolveApproval } from "./approval.js";

const requests: Array<{ id: number; tool: string }> = [];
const cancels: number[] = [];

/** Registers the listener that answers every request with `answer`. */
const autoAnswer = (answer: boolean) =>
  events.onEvent("approval:request", ({ id }) => {
    resolveApproval(id, answer);
  });

beforeEach(() => {
  requests.length = 0;
  cancels.length = 0;
  events.onEvent(
    "approval:request",
    ({ id }) => void requests.push({ id, tool: "" }),
  );
  events.onEvent("approval:cancel", ({ id }) => void cancels.push(id));
});

afterEach(() => {
  events.removeAllListeners("approval:request");
  events.removeAllListeners("approval:cancel");
});

describe("approval round-trip", () => {
  it("resolves the pending request with the client's answer", async () => {
    const off = autoAnswer(true);
    const p = requestApproval({ tool: "bash", command: "ls" });
    await expect(p).resolves.toBe(true);
    off();
  });

  it("a denied request resolves false", async () => {
    const off = autoAnswer(false);
    await expect(requestApproval({ tool: "write_file" })).resolves.toBe(false);
    off();
  });

  it("only the first answer wins; repeat resolutions are rejected", async () => {
    events.onEvent("approval:request", ({ id }) => {
      expect(resolveApproval(id, true)).toBe(true);
      expect(resolveApproval(id, true)).toBe(false);
      expect(resolveApproval(id, false)).toBe(false);
    });
    await expect(requestApproval({ tool: "bash" })).resolves.toBe(true);
  });

  it("an unknown id is rejected", () => {
    expect(resolveApproval(999_999, true)).toBe(false);
    expect(resolveApproval(-1, true)).toBe(false);
  });

  it("answering broadcasts a cancel so every client can drop the dialog", async () => {
    const off = autoAnswer(true);
    const p = requestApproval({ tool: "bash", command: "ls" });
    await expect(p).resolves.toBe(true);
    off();
    // Exactly one cancel — for this request only, not accumulations.
    expect(cancels).toHaveLength(1);
  });

  it("the request announces the tool, the command, and the host", async () => {
    let got: { tool: string; command?: string; host?: string } | undefined;
    const off = events.onEvent("approval:request", (req) => {
      got = req;
      resolveApproval(req.id, true);
    });
    await expect(
      requestApproval({ tool: "bash", command: "ls -la" }),
    ).resolves.toBe(true);
    off();
    expect(got?.tool).toBe("bash");
    expect(got?.command).toBe("ls -la");
    expect(got?.host?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("approval cancellation", () => {
  it("an aborted signal retracts the dialog and denies the tool", async () => {
    const controller = new AbortController();
    const p = requestApproval({ tool: "bash" }, controller.signal);
    controller.abort();
    await expect(p).resolves.toBe(false);
    expect(cancels.length).toBeGreaterThan(0);
  });

  it("a pre-aborted signal denies immediately without emitting a request", () => {
    const controller = new AbortController();
    controller.abort();
    const before = requests.length;
    const p = requestApproval({ tool: "bash" }, controller.signal);
    return expect(p)
      .resolves.toBe(false)
      .then(() => {
        expect(requests).toHaveLength(before);
      });
  });

  it("a timed-out request resolves false and is retracted", async () => {
    vi.useFakeTimers();
    try {
      const p = requestApproval({ tool: "bash" });
      void vi.advanceTimersByTimeAsync(10 * 60_000 + 1);
      await expect(p).resolves.toBe(false);
      expect(cancels.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("an answered request is immune to its own abort afterwards", async () => {
    const off = events.onEvent("approval:request", ({ id }) => {
      resolveApproval(id, true);
    });
    const p = requestApproval({ tool: "bash" });
    await expect(p).resolves.toBe(true);
    off();
  });
});
