import { z } from "zod";
import type { InputRequest } from "../types/tool";

/** Choice fields offer between 2 and 6 options; forms hold 1–4 fields. */
export const INPUT_OPTION_SCHEMA = z.object({
  value: z.string(),
  label: z.string(),
});

const INPUT_FIELD_BASE = {
  id: z.string().min(1).max(100),
  label: z.string().max(300).optional(),
  required: z.boolean().optional(),
};

export const INPUT_CHOICE_FIELD_SCHEMA = z.object({
  ...INPUT_FIELD_BASE,
  kind: z.literal("choice"),
  options: z.array(INPUT_OPTION_SCHEMA).min(2).max(6),
});

export const INPUT_TEXT_FIELD_SCHEMA = z.object({
  ...INPUT_FIELD_BASE,
  kind: z.literal("text"),
  placeholder: z.string().max(300).optional(),
  multiline: z.boolean().optional(),
});

export const INPUT_FIELD_SCHEMA = z.union([
  INPUT_CHOICE_FIELD_SCHEMA,
  INPUT_TEXT_FIELD_SCHEMA,
]);

/**
 * The model's payload for `request_user_input`, before the service stamps the
 * id and host. Used by the tool executor to validate and clamp arguments.
 */
export const INPUT_REQUEST_SCHEMA = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  fields: z.array(INPUT_FIELD_SCHEMA).min(1).max(4),
  submitLabel: z.string().max(300).optional(),
  cancelLabel: z.string().max(300).optional(),
}) satisfies z.ZodType<Omit<InputRequest, "id" | "host">>;

export const INPUT_RESPONSE_SCHEMA = z.object({
  id: z.number(),
  answers: z.record(z.string(), z.string()).optional(),
  cancelled: z.boolean().optional(),
});
