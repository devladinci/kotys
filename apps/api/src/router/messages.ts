import { z } from "zod";
import {
  getMessages,
  getMessage,
  insertMessage,
  updateMessage,
  searchMessages,
  getChatIdForMessage,
  resetAssistantMessage,
} from "@kotys/db";
import { pub } from "./base.js";
import { events } from "../services/events.js";

export const messagesRouter = {
  list: pub
    .input(z.object({ chatId: z.number() }))
    .handler(async ({ input }) => getMessages(input.chatId)),

  get: pub
    .input(z.object({ id: z.number() }))
    .handler(async ({ input }) => getMessage(input.id) ?? null),

  insert: pub
    .input(
      z.object({
        chatId: z.number(),
        role: z.string(),
        content: z.string(),
        images: z.array(z.string()).optional(),
        modelId: z.number().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const id = await insertMessage(
        input.chatId,
        input.role,
        input.content,
        input.images,
        input.modelId,
      );
      // A new message also bumps the chat's updated_at, so the list order
      // changes everywhere — one chat row event covers both surfaces.
      if (id !== null) {
        events.emitEvent("chats:changed", { chatId: input.chatId });
        events.emitEvent("messages:changed", {
          chatId: input.chatId,
          messageId: id,
        });
      }
      return id;
    }),

  update: pub
    .input(
      z.object({
        id: z.number(),
        content: z.string().optional(),
        thinking: z.string().optional(),
        promptTokens: z.number().optional(),
        evalTokens: z.number().optional(),
        tokensMeasured: z.boolean().optional(),
        toolCalls: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      await updateMessage(input.id, input);
      // Resolve the owning chat so clients can scope the refetch; the
      // message may already be gone (deleted chat mid-stream).
      const chatId = getChatIdForMessage(input.id);
      if (chatId !== null) {
        events.emitEvent("messages:changed", { chatId, messageId: input.id });
      }
    }),

  search: pub
    .input(z.object({ query: z.string() }))
    .handler(async ({ input }) => searchMessages(input.query)),

  resetForRetry: pub
    .input(z.object({ id: z.number() }))
    .handler(async ({ input }) => {
      resetAssistantMessage(input.id);
      const chatId = getChatIdForMessage(input.id);
      if (chatId !== null) {
        events.emitEvent("messages:changed", { chatId, messageId: input.id });
      }
    }),
};
