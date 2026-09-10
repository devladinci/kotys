import { chatsRouter } from "./chats.js";
import { messagesRouter } from "./messages.js";
import { memoriesRouter } from "./memories.js";
import { todosRouter } from "./todos.js";
import { pomodoroRouter } from "./pomodoro.js";
import { settingsRouter } from "./settings.js";
import { toolsRouter } from "./tools.js";
import { mcpRouter } from "./mcp.js";
import { skillsRouter } from "./skills.js";
import { ollamaRouter } from "./ollama.js";
import { modelsRouter } from "./models.js";
import { analyticsRouter } from "./analytics.js";
import { sttRouter } from "./stt.js";

export const router = {
  chats: chatsRouter,
  messages: messagesRouter,
  memories: memoriesRouter,
  todos: todosRouter,
  pomodoro: pomodoroRouter,
  settings: settingsRouter,
  tools: toolsRouter,
  mcp: mcpRouter,
  skills: skillsRouter,
  ollama: ollamaRouter,
  models: modelsRouter,
  analytics: analyticsRouter,
  stt: sttRouter,
};

export type AppRouter = typeof router;
