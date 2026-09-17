export type MemoryType = "user" | "preference" | "project" | "fact";

export const MEMORY_TYPES: MemoryType[] = [
  "user",
  "preference",
  "project",
  "fact",
];

export type MemoryRecord = {
  id: number;
  key: string;
  content: string;
  type: MemoryType;
  source_chat_id: number | null;
  source_chat_title: string | null;
  topics: string[];
  created_at: number;
  updated_at: number;
  use_count: number;
  last_used_at: number | null;
};
