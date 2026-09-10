export type ModelUsageRow = {
  name: string;
  provider: string;
  source: "cloud" | "local";
  messages: number;
  prompt_tokens: number;
  eval_tokens: number;
  last_used_at: number | null;
};

export type ToolUsageRow = {
  tool: string;
  server: string | null;
  calls: number;
  errors: number;
  total_ms: number;
};

export type ActivityDayRow = {
  day: number;
  messages: number;
  tokens: number;
};

export type AnalyticsOverview = {
  total_chats: number;
  total_messages: number;
  user_messages: number;
  eval_tokens: number;
  models: ModelUsageRow[];
  tools: ToolUsageRow[];
  activity: ActivityDayRow[];
};
