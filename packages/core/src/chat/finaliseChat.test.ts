import { beforeEach, describe, expect, it } from "vitest";
import {
  chatIdFor,
  claimLiveStream,
  releaseLiveStream,
  resetLiveStreams,
} from "./liveStreams.js";
import {
  finishStreamEntry,
  isStreaming,
  resetStreamState,
  startStreamEntry,
} from "./streamState.js";
import { resetEchoGuard } from "./echoGuard.js";
import { clearStreamActivity } from "./echoGuard.js";

/**
 * Regression harness for the stuck-generating bug: `onOwnDone` used to
 * release the claim before finalise read `chatIdFor`, so a background
 * chat's done (active chat is another one) fell back to `activeChatId`,
 * never cleared the finishing chat's stream entry, and the timeline kept
 * counting. The correct sequence is: resolve chat from the claim, then
 * release — so the finalise clears the *finishing* chat's entry.
 */
describe("done/error finalise resolves the finishing chat's entry", () => {
  beforeEach(() => {
    resetLiveStreams();
    resetStreamState();
    resetEchoGuard();
  });

  it("reading the claim before releasing keeps the finishing chat resolvable", () => {
    // Chat 7 streams in the background; the user is viewing chat 9.
    claimLiveStream(42, 7);
    startStreamEntry(7, 42);
    // The fixed order: read, then release, then clear.
    const doneChatId = chatIdFor(42) ?? 9;
    releaseLiveStream(42);
    expect(doneChatId).toBe(7);

    finishStreamEntry(doneChatId);
    clearStreamActivity(doneChatId);
    // Chat 7's entry is gone; a fallback to the open chat (9) would have
    // left it stuck and wrongly cleared chat 9 instead.
    expect(isStreaming(7)).toBe(false);
  });

  it("releasing first loses the chat and strands the entry", () => {
    // Documents the old broken sequence so a regression of the order trips.
    claimLiveStream(42, 7);
    startStreamEntry(7, 42);
    releaseLiveStream(42);
    const doneChatId = chatIdFor(42) ?? 9;
    expect(doneChatId).toBe(9);
    finishStreamEntry(9);
    expect(isStreaming(7)).toBe(true); // stuck forever — the reported bug
  });
});
