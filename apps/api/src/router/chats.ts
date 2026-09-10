import { z } from "zod";
import {
  listChatsWithTopics,
  createChat,
  renameChat,
  deleteChat,
  getChatById,
  setChatTopics,
  setChatSummary,
  setChatModel,
  getChatMessageCount,
} from "@kotys/db";
import { MODEL_LISTING_SCHEMA } from "@kotys/contracts";
import { pub } from "./base.js";
import { events } from "../services/events.js";
import { compactChat } from "../services/chat/compact.js";
import { liveForChat } from "../ws/streams.js";

export const chatsRouter = {
  list: pub.handler(async () => listChatsWithTopics()),

  get: pub
    .input(z.object({ id: z.number() }))
    .handler(async ({ input }) => getChatById(input.id)),

  create: pub
    .input(z.object({ title: z.string(), model: MODEL_LISTING_SCHEMA }))
    .handler(async ({ input }) => {
      const id = await createChat(input.title, input.model);
      events.emitEvent("chats:changed", { chatId: Number(id) });
      return id;
    }),

  rename: pub
    .input(z.object({ id: z.number(), title: z.string() }))
    .handler(async ({ input }) => {
      renameChat(input.id, input.title);
      events.emitEvent("chats:changed", { chatId: input.id });
      return { ok: true as const };
    }),

  remove: pub.input(z.object({ id: z.number() })).handler(async ({ input }) => {
    deleteChat(input.id);
    events.emitEvent("chats:changed", { chatId: input.id });
    events.emitEvent("messages:changed", { chatId: input.id, messageId: -1 });
    return { ok: true as const };
  }),

  setTopics: pub
    .input(z.object({ id: z.number(), topics: z.array(z.string()) }))
    .handler(async ({ input }) => {
      setChatTopics(input.id, input.topics);
      events.emitEvent("chats:changed", { chatId: input.id });
      return { ok: true as const };
    }),

  setSummary: pub
    .input(z.object({ id: z.number(), summary: z.string(), upto: z.number() }))
    .handler(async ({ input }) => {
      setChatSummary(input.id, input.summary, input.upto);
      events.emitEvent("chats:changed", { chatId: input.id });
      return { ok: true as const };
    }),

  setModel: pub
    .input(z.object({ id: z.number(), model: MODEL_LISTING_SCHEMA }))
    .handler(async ({ input }) => {
      setChatModel(input.id, input.model);
      events.emitEvent("chats:changed", { chatId: input.id });
      return { ok: true as const };
    }),

  messageCount: pub
    .input(z.object({ id: z.number() }))
    .handler(async ({ input }) => getChatMessageCount(input.id)),

  compact: pub
    .input(z.object({ id: z.number(), force: z.boolean().optional() }))
    .handler(async ({ input }) => {
      const result = await compactChat(input.id, { force: input.force });
      if (result) {
        events.emitEvent("chats:changed", { chatId: input.id });
        events.emitEvent("messages:changed", {
          chatId: input.id,
          messageId: -1,
        });
      }
      return result ?? { compacted: false as const };
    }),

  /** The requestId still streaming into this chat, if any (remount adopt). */
  liveStream: pub
    .input(z.object({ chatId: z.number() }))
    .handler(async ({ input }) => liveForChat(input.chatId)),
};
