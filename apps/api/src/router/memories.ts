import { z } from "zod";
import {
  listMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  searchMemories,
  getMemoriesForChat,
} from "@kotys/db";
import { pub } from "./base.js";

const memoryCreateInput = z.object({
  key: z.string(),
  content: z.string(),
  type: z.enum(["user", "preference", "project", "fact"]),
  topics: z.array(z.string()),
  sourceChatId: z.number().nullable(),
});

const memoryUpdateInput = z.object({
  id: z.number(),
  content: z.string().optional(),
  type: z.enum(["user", "preference", "project", "fact"]).optional(),
  topics: z.array(z.string()).optional(),
});

const memorySearchInput = z.object({
  query: z.string().optional(),
  topic: z.string().optional(),
  type: z.enum(["user", "preference", "project", "fact"]).optional(),
  limit: z.number().optional(),
});

export const memoriesRouter = {
  list: pub.handler(async () => listMemories()),

  create: pub
    .input(memoryCreateInput)
    .handler(async ({ input }) => createMemory(input)),

  update: pub.input(memoryUpdateInput).handler(async ({ input }) =>
    updateMemory(input.id, {
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.topics !== undefined ? { topics: input.topics } : {}),
    }),
  ),

  remove: pub
    .input(z.object({ id: z.number() }))
    .handler(async ({ input }) => deleteMemory(input.id)),

  search: pub
    .input(memorySearchInput)
    .handler(async ({ input }) => searchMemories(input)),

  forChat: pub
    .input(
      z.object({ chatId: z.number().nullable(), limit: z.number().optional() }),
    )
    .handler(async ({ input }) =>
      getMemoriesForChat(input.chatId, input.limit),
    ),
};
