import type {
  ToolDefinition,
  ToolArgs,
  ToolResult,
  InputField,
} from "@kotys/contracts";
import { INPUT_REQUEST_SCHEMA } from "@kotys/contracts";
import type { ToolContext } from "./types.js";

export const definition: ToolDefinition = {
  type: "function",
  category: "chat",
  function: {
    name: "request_user_input",
    description:
      "Present a small form to the user and wait for their answer. Fields are multiple-choice (single-select) or free-text. Use whenever you need structured input — quizzes and tests (one question per call), picking between alternatives, short forms. Do not use it for open-ended conversation; ask in plain text then.",
    parameters: {
      type: "object",
      required: ["title", "fields"],
      properties: {
        title: {
          type: "string",
          description: "Heading of the form, e.g. the question itself.",
        },
        description: {
          type: "string",
          description: "Optional explanation shown under the title.",
        },
        fields: {
          type: "array",
          description:
            "1–4 form fields. A choice field offers 2–6 single-select options; a text field accepts free text. Answer keys are the field ids.",
          items: {
            type: "object",
            required: ["id", "kind"],
            properties: {
              id: {
                type: "string",
                description:
                  'Key this field\'s answer is returned under, e.g. "answer".',
              },
              kind: {
                type: "string",
                enum: ["choice", "text"],
              },
              label: {
                type: "string",
                description: "Label shown above the field. Defaults to the id.",
              },
              required: {
                type: "boolean",
                description:
                  "Whether submit blocks until the field is filled. Default true.",
              },
              options: {
                type: "array",
                description: "choice fields only: 2–6 options.",
                items: {
                  type: "object",
                  required: ["value", "label"],
                  properties: {
                    value: { type: "string" },
                    label: { type: "string" },
                  },
                },
              },
              placeholder: {
                type: "string",
                description: "text fields only: hint shown in the empty input.",
              },
              multiline: {
                type: "boolean",
                description:
                  "text fields only: render a textarea for longer answers.",
              },
            },
          },
        },
        submitLabel: {
          type: "string",
          description: 'Label of the submit button. Default "Submit".',
        },
        cancelLabel: {
          type: "string",
          description: 'Label of the cancel button. Default "Cancel".',
        },
      },
    },
  },
};

// Long model-supplied strings are truncated rather than rejected — a chatty
// title should not kill the question.
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;
const MAX_LABEL = 300;

const clamp = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
};

function buildRequest(args: ToolArgs): {
  title: string;
  description?: string;
  fields: InputField[];
  submitLabel?: string;
  cancelLabel?: string;
} {
  return INPUT_REQUEST_SCHEMA.parse({
    title: String(args.title ?? "")
      .trim()
      .slice(0, MAX_TITLE),
    ...(args.description
      ? { description: clamp(args.description, MAX_DESCRIPTION) }
      : {}),
    fields: Array.isArray(args.fields) ? args.fields : [],
    ...(args.submitLabel
      ? { submitLabel: clamp(args.submitLabel, MAX_LABEL) }
      : {}),
    ...(args.cancelLabel
      ? { cancelLabel: clamp(args.cancelLabel, MAX_LABEL) }
      : {}),
  });
}

export async function execute(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  if (typeof ctx.requestUserInput !== "function") {
    return {
      content: "user input not available — no client can answer",
      activity: { status: "error", error: "no input channel" },
    };
  }
  let request;
  try {
    request = buildRequest(args);
  } catch (err) {
    return {
      content: `invalid input request: ${err instanceof Error ? err.message : String(err)}`,
      activity: { status: "error", error: "invalid arguments" },
    };
  }
  const answers = await ctx.requestUserInput(request);
  // The trace is the only durable record of the round-trip — the answers go
  // back to the model as a tool message that is never persisted. The widget
  // renders the whole Q&A inline in the chat history.
  const widget = {
    kind: "input" as const,
    title: request.title,
    ...(request.description ? { description: request.description } : {}),
    fields: request.fields,
    answers,
  };
  if (answers === null) {
    return {
      content: "User did not answer the form.",
      activity: { query: request.title, widget },
    };
  }
  return {
    content: JSON.stringify({ answers }),
    activity: { query: request.title, widget },
  };
}
