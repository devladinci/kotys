import { z } from "zod";
import {
  listTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  toggleTodoStatus,
  reorderTodos,
  getTodoById,
  getChatByTodoId,
  createChatForTodo,
  getChatMessageCount,
} from "@kotys/db";
import { MODEL_LISTING_SCHEMA, asEpochSeconds } from "@kotys/contracts";
import { pub } from "./base.js";

const todoStatus = z.enum(["pending", "in_progress", "completed", "archived"]);
const todoPriority = z.enum(["low", "medium", "high"]);
const todoCreator = z.enum(["user", "agent"]);

const listFilters = z.object({
  status: z.string().optional(),
  chat_id: z.number().optional(),
  has_due_date: z.boolean().optional(),
});

const createTodoInput = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  chat_id: z.number().nullable().optional(),
  status: todoStatus.optional(),
  priority: todoPriority.optional(),
  due_at: z.number().nullable().optional(),
  notify_at: z.number().nullable().optional(),
  created_by: todoCreator.optional(),
});

export const todosRouter = {
  list: pub
    .input(listFilters.optional())
    .handler(async ({ input }) => listTodos(input ?? undefined)),

  create: pub.input(createTodoInput).handler(async ({ input }) =>
    createTodo({
      ...input,
      due_at: input.due_at == null ? null : asEpochSeconds(input.due_at),
      notify_at:
        input.notify_at == null ? null : asEpochSeconds(input.notify_at),
    }),
  ),

  update: pub
    .input(
      z.object({ id: z.number(), fields: z.record(z.string(), z.unknown()) }),
    )
    .handler(async ({ input }) =>
      updateTodo(input.id, input.fields as Record<string, unknown>),
    ),

  remove: pub
    .input(z.object({ id: z.number() }))
    .handler(async ({ input }) => deleteTodo(input.id)),

  toggle: pub
    .input(z.object({ id: z.number() }))
    .handler(async ({ input }) => toggleTodoStatus(input.id)),

  reorder: pub
    .input(z.object({ order: z.array(z.number()) }))
    .handler(async ({ input }) => {
      reorderTodos(input.order);
      return { ok: true as const };
    }),

  chatAbout: pub
    .input(z.object({ todoId: z.number(), model: MODEL_LISTING_SCHEMA }))
    .handler(async ({ input }) => {
      const todo = getTodoById(input.todoId);
      if (!todo) throw new Error("Todo not found");
      let chatId = getChatByTodoId(todo.id);
      let prompt: string | null = null;
      if (chatId === null) {
        const title = `Todo: ${todo.title}`;
        chatId = createChatForTodo(todo.id, title, input.model);
      }
      if (getChatMessageCount(chatId) === 0) {
        const parts = [`Let's work on this todo:`, ``, `**${todo.title}**`, ``];
        if (todo.description)
          parts.push(`Description: ${todo.description}`, ``);
        parts.push(`Status: ${todo.status}`);
        parts.push(`Priority: ${todo.priority}`);
        if (todo.due_at)
          parts.push(
            `Due: ${new Date(todo.due_at).toISOString().slice(0, 10)}`,
          );
        prompt = parts.join("\n");
      }
      return { chat_id: chatId, prompt };
    }),
};
