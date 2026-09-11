import { z } from "zod";
import { INPUT_FIELD_SCHEMA } from "./input.js";

const TODO_WIDGET_SCHEMA = z.object({
  kind: z.literal("todo"),
  action: z.enum(["created", "updated", "completed", "reopened", "deleted"]),
  id: z.number(),
  title: z.string(),
  description: z.string().optional(),
  status: z
    .enum(["pending", "in_progress", "completed", "archived"])
    .optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  due_at: z.union([z.number(), z.string()]).nullable().optional(),
  notify_at: z.union([z.number(), z.string()]).nullable().optional(),
});

const INPUT_WIDGET_SCHEMA = z.object({
  kind: z.literal("input"),
  title: z.string(),
  description: z.string().optional(),
  fields: z.array(INPUT_FIELD_SCHEMA),
  answers: z.record(z.string(), z.string()).nullable(),
});

const IMAGE_WIDGET_SCHEMA = z.object({
  kind: z.literal("image"),
  images: z.array(z.string()),
});

const WIDGET_SCHEMA = z.union([
  TODO_WIDGET_SCHEMA,
  INPUT_WIDGET_SCHEMA,
  IMAGE_WIDGET_SCHEMA,
]);

export const TOOL_ACTIVITY_SCHEMA = z.object({
  tool: z.string(),
  server: z.string().optional(),
  query: z.string().optional(),
  url: z.string().optional(),
  filePath: z.string().optional(),
  status: z.enum(["running", "done", "error"]),
  durationMs: z.number().optional(),
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
  turnStartedAt: z.number().optional(),
  turnEndedAt: z.number().optional(),
  textOffset: z.number().optional(),
  roundAnchor: z.number().optional(),
  results: z.array(z.object({ title: z.string(), url: z.string() })).optional(),
  widget: WIDGET_SCHEMA.optional(),
  error: z.string().optional(),
});

export const MODEL_LISTING_SCHEMA = z.object({
  name: z.string(),
  contextLength: z.number().nullable(),
  capabilities: z.array(z.string()),
  source: z.enum(["cloud", "local"]),
  // Zod strips undeclared keys: omitting provider here silently downgraded
  // every persisted non-ollama model to the ollama connector.
  provider: z.string().optional(),
  host: z.string().optional(),
});
