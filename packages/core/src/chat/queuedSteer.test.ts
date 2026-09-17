import { describe, expect, it } from "vitest";
import type { QueuedMessage } from "./queueStore.js";
import { queueCaption, steerStateOf } from "./queuedSteer.js";

const queued = (overrides: Partial<QueuedMessage> = {}): QueuedMessage => ({
  id: 1,
  text: "use Y instead",
  content: "use Y instead",
  images: [],
  ...overrides,
});

describe("steerStateOf", () => {
  it("is ready for a text message while a reply streams", () => {
    expect(steerStateOf(queued(), 500)).toBe("ready");
  });

  it("is unavailable when no reply is streaming", () => {
    expect(steerStateOf(queued(), null)).toBe("unavailable");
  });

  it("is injecting once offered to the streaming reply", () => {
    const offered = queued({ steer: { requestId: 500, key: "k1" } });
    expect(steerStateOf(offered, 500)).toBe("injecting");
  });

  it("is ready again for a later reply when an earlier one never took it", () => {
    const offered = queued({ steer: { requestId: 400, key: "k1" } });
    expect(steerStateOf(offered, 500)).toBe("ready");
  });

  it("keeps messages with images or without text for their own turn", () => {
    expect(steerStateOf(queued({ images: ["AAAA"] }), 500)).toBe("unavailable");
    expect(steerStateOf(queued({ text: "   " }), 500)).toBe("unavailable");
  });
});

describe("queueCaption", () => {
  it("offers steering while a reply streams", () => {
    expect(queueCaption(true, 2)).toBe(
      "Queued — inject to steer this reply, or it sends when the reply finishes",
    );
  });

  it("counts the queue when idle", () => {
    expect(queueCaption(false, 2)).toBe(
      "2 queued — sends when the reply finishes",
    );
  });
});
