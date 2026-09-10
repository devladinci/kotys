import { describe, expect, it } from "vitest";
import { execute, definition } from "./request_user_input.js";
import type { ToolContext } from "./types.js";

const ctxWith = (
  requestUserInput?: ToolContext["requestUserInput"],
): ToolContext =>
  ({
    homedir: "/tmp",
    chatId: null,
    chatTopics: [],
    signal: new AbortController().signal,
    ...(requestUserInput ? { requestUserInput } : {}),
  }) as unknown as ToolContext;

const choiceArgs = {
  title: "Which case is 'puellam'?",
  fields: [
    {
      id: "answer",
      kind: "choice",
      options: [
        { value: "A", label: "Nominative" },
        { value: "B", label: "Accusative" },
      ],
    },
  ],
};

describe("request_user_input definition", () => {
  it("registers under its name in the chat category", () => {
    expect(definition.function.name).toBe("request_user_input");
    expect(definition.category).toBe("chat");
  });
});

describe("request_user_input validation", () => {
  it("errors when no client can answer", async () => {
    const result = await execute(choiceArgs, ctxWith());
    expect(result.activity.status).toBe("error");
    expect(result.content).toBe(
      "user input not available — no client can answer",
    );
  });

  it("rejects an empty fields array", async () => {
    const result = await execute({ title: "Q", fields: [] }, ctxWith());
    expect(result.activity.status).toBe("error");
  });

  it("rejects a choice field with fewer than two options", async () => {
    const result = await execute(
      {
        title: "Q",
        fields: [
          { id: "a", kind: "choice", options: [{ value: "A", label: "A" }] },
        ],
      },
      ctxWith(),
    );
    expect(result.activity.status).toBe("error");
  });

  it("rejects a missing title", async () => {
    const result = await execute(
      { fields: [{ id: "a", kind: "text" }] },
      ctxWith(),
    );
    expect(result.activity.status).toBe("error");
  });
});

describe("request_user_input round-trip", () => {
  it("null answer becomes the did-not-answer content", async () => {
    const result = await execute(
      choiceArgs,
      ctxWith(() => Promise.resolve(null)),
    );
    expect(result.content).toBe("User did not answer the form.");
    expect(result.activity.status).toBeUndefined();
  });

  it("answers round-trip into the content JSON", async () => {
    const result = await execute(
      choiceArgs,
      ctxWith(() => Promise.resolve({ answer: "B" })),
    );
    expect(JSON.parse(result.content)).toEqual({
      answers: { answer: "B" },
    });
    expect(result.activity.query).toBe("Which case is 'puellam'?");
    expect(result.activity.widget).toEqual({
      kind: "input",
      title: "Which case is 'puellam'?",
      fields: choiceArgs.fields,
      answers: { answer: "B" },
    });
  });

  it("records the question even when the user does not answer", async () => {
    const result = await execute(
      choiceArgs,
      ctxWith(() => Promise.resolve(null)),
    );
    expect(result.activity.query).toBe("Which case is 'puellam'?");
    expect(
      result.activity.widget?.kind === "input" &&
        result.activity.widget.answers,
    ).toBeNull();
  });

  it("keeps the form structure in the widget for the inline card", async () => {
    const result = await execute(
      {
        title: "Q",
        description: "Pick one",
        fields: [
          {
            id: "a",
            kind: "choice",
            label: "First letter of 'rosa'?",
            options: [
              { value: "r", label: "r" },
              { value: "p", label: "p" },
            ],
          },
        ],
      },
      ctxWith(() => Promise.resolve({ a: "r" })),
    );
    expect(result.activity.widget).toMatchObject({
      kind: "input",
      title: "Q",
      description: "Pick one",
      answers: { a: "r" },
    });
  });

  it("passes a validated, clamped request to the channel", async () => {
    let got: unknown;
    const result = await execute(
      {
        title: "T".repeat(500),
        description: "d",
        fields: [{ id: "a", kind: "text", placeholder: "p" }],
      },
      ctxWith((req) => {
        got = req;
        return Promise.resolve({ a: "x" });
      }),
    );
    expect(result.activity.status).toBeUndefined();
    expect((got as { title: string }).title).toHaveLength(200);
  });
});
