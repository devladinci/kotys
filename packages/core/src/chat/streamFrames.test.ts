import { describe, expect, it, beforeEach } from "vitest";
import {
  claimLiveStream,
  releaseLiveStream,
  resetLiveStreams,
} from "./liveStreams.js";
import { classifyFrame } from "./streamFrames.js";

beforeEach(() => {
  resetLiveStreams();
});

describe("classifyFrame", () => {
  it("routes claimed request ids as own — parallel streams stay own", () => {
    // Chat 7 and chat 8 both stream from this client.
    claimLiveStream(42, 7);
    claimLiveStream(43, 8);
    // Frames for either arrive while viewing some other chat (9).
    expect(classifyFrame(42, 7, 9)).toBe("own");
    expect(classifyFrame(43, 8, 9)).toBe("own");
    // Even frames stamped with the open chat stay own while claimed.
    expect(classifyFrame(42, 9, 9)).toBe("own");
  });

  it("releasing a claim demotes its frames to foreign routing", () => {
    claimLiveStream(42, 7);
    releaseLiveStream(42);
    // Viewing chat 7: the finishing stream's frames are foreign-visible now.
    expect(classifyFrame(42, 7, 7)).toBe("visible");
    expect(classifyFrame(42, 8, 7)).toBe("ignore");
  });

  it("unknown request ids route by the open chat as before", () => {
    expect(classifyFrame(99, 9, 9)).toBe("visible");
    expect(classifyFrame(99, 8, 9)).toBe("ignore");
    // Legacy server / owner never sent a chatId: nothing to scope with.
    expect(classifyFrame(99, undefined, 9)).toBe("ignore");
  });

  it("no claims at all falls back to active-chat routing", () => {
    expect(classifyFrame(99, 7, 7)).toBe("visible");
    expect(classifyFrame(99, 8, 7)).toBe("ignore");
  });
});
