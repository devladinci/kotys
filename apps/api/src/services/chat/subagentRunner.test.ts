import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "@kotys/contracts";
import type { ToolContext } from "../../tools/types.js";

const h = vi.hoisted(() => ({
  state: {
    scripts: [] as {
      content?: string;
      tool_calls?: {
        function: { name: string; arguments: Record<string, unknown> };
      }[];
    }[][],
    rounds: [] as { messages: unknown[]; tools?: unknown[] }[],
  },
  reset() {
    h.state.scripts.length = 0;
    h.state.rounds.length = 0;
  },
}));

vi.mock("ollama", () => ({
  Ollama: class {
    chat(body: { messages: unknown[]; tools?: unknown[] }) {
      h.state.rounds.push(body);
      const parts = h.state.scripts.shift() ?? [];
      return (async function* () {
        for (const part of parts) {
          yield {
            message: part,
            done: true,
            prompt_eval_count: 100,
            eval_count: 10,
          };
        }
      })();
    }
    abort() {}
  },
}));

vi.mock("@kotys/db", () => ({
  createSubagentChat: (...args: unknown[]) => h2.created.push(args) && 777,
  insertMessage: (...args: unknown[]) => h2.inserted.push(args) && 501,
  insertToolResults: (...args: unknown[]) => h2.toolResults.push(args),
  getSetting: () => null,
}));

const h2 = vi.hoisted(() => ({
  created: [] as unknown[][],
  inserted: [] as unknown[][],
  toolResults: [] as unknown[],
}));

import { runSubagent, wrapSubagentResult } from "./subagentRunner.js";
import { spawnSubagent } from "./subagentSpawn.js";

const model = {
  name: "test-model",
  source: "local" as const,
  contextLength: 128_000,
};

const toolCallPart = (
  name: string,
  args: Record<string, unknown> = {},
): {
  content?: string;
  tool_calls?: {
    function: { name: string; arguments: Record<string, unknown> };
  }[];
} => ({ tool_calls: [{ function: { name, arguments: args } }] });

const textPart = (content: string) => ({ content });

const baseCtx = (): ToolContext => ({
  ollama: {} as ToolContext["ollama"],
  homedir: "/tmp",
  chatId: 42,
  chatTopics: [],
  signal: new AbortController().signal,
  parentModel: model,
});

beforeEach(() => {
  h.reset();
  h2.created.length = 0;
  h2.inserted.length = 0;
  h2.toolResults.length = 0;
});

describe("runSubagent", () => {
  it("sends the agent body as system prompt and the task as user turn", async () => {
    h.state.scripts.push([textPart("All done.")]);
    const run = await runSubagent({
      agent: "explore",
      prompt: "Find the answer",
      parentChatId: 42,
      model,
      signal: new AbortController().signal,
      toolContext: baseCtx(),
    });
    const first = h.state.rounds[0];
    expect(first.messages[0]).toMatchObject({
      role: "system",
      content: expect.stringContaining("read-only research agent"),
    });
    expect(first.messages[1]).toMatchObject({
      role: "user",
      content: "Find the answer",
    });
    expect(run.content).toBe("All done.");
    expect(run.childChatId).toBe(777);
  });

  it("restricts the advertised tools to the agent's allowlist", async () => {
    h.state.scripts.push([textPart("done")]);
    await runSubagent({
      agent: "explore",
      prompt: "go",
      parentChatId: 42,
      model,
      signal: new AbortController().signal,
      toolContext: baseCtx(),
    });
    const toolNames = (h.state.rounds[0].tools as ToolDefinition[]).map(
      (d) => d.function.name,
    );
    expect(toolNames).toContain("read_file");
    expect(toolNames).not.toContain("bash");
    expect(toolNames).not.toContain("spawn_agent");
  });

  it("runs a tool round and feeds the result back", async () => {
    h.state.scripts.push([toolCallPart("read_file", { path: "a.ts" })]);
    h.state.scripts.push([textPart("found it")]);
    const run = await runSubagent({
      agent: "explore",
      prompt: "read a.ts",
      parentChatId: 42,
      model,
      signal: new AbortController().signal,
      toolContext: baseCtx(),
    });
    expect(run.toolCalls.length).toBe(1);
    expect(run.toolCalls[0].tool).toBe("read_file");
    expect(run.content).toBe("found it");
    const second = h.state.rounds[1];
    expect(
      second.messages.some((m) => (m as { role: string }).role === "tool"),
    ).toBe(true);
  });

  it("wraps the final text in task_result with the child chat id", () => {
    const wrapped = wrapSubagentResult("findings here", 77);
    expect(wrapped).toContain("<task_result>");
    expect(wrapped).toContain("findings here");
    expect(wrapped).toContain("child chat id: 77");
  });
});

describe("spawnSubagent", () => {
  it("denies nesting from inside a subagent turn", async () => {
    const outcome = await spawnSubagent(
      { agent: "explore", prompt: "x", description: "d" },
      { ...baseCtx(), isSubagent: true },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.content).toContain("cannot spawn");
  });

  it("rejects an unknown agent without running anything", async () => {
    const outcome = await spawnSubagent(
      { agent: "nope", prompt: "x", description: "d" },
      baseCtx(),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.content).toContain("unknown subagent");
    expect(h.state.rounds).toHaveLength(0);
  });

  it("rejects an empty prompt", async () => {
    const outcome = await spawnSubagent(
      { agent: "explore", prompt: "  ", description: "d" },
      baseCtx(),
    );
    expect(outcome.ok).toBe(false);
    expect(h.state.rounds).toHaveLength(0);
  });

  it("runs a successful spawn and returns a wrapped result", async () => {
    h.state.scripts.push([textPart("research complete")]);
    const outcome = await spawnSubagent(
      { agent: "explore", prompt: "look around", description: "Exploring" },
      baseCtx(),
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.content).toContain("<task_result>");
    expect(outcome.content).toContain("research complete");
  });

  it("is unavailable without a parent model", async () => {
    const outcome = await spawnSubagent(
      { agent: "explore", prompt: "x", description: "d" },
      { ...baseCtx(), parentModel: undefined },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.content).toContain("without a parent model");
  });
});
