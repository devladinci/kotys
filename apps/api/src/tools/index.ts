import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import type { ToolContext, ToolModule } from "./types.js";
import {
  definition as captureScreenDef,
  execute as captureScreenExec,
} from "./capture_screen.js";
import {
  definition as currentDateTimeDef,
  execute as currentDateTimeExec,
} from "./current_datetime.js";
import {
  definition as webSearchDef,
  execute as webSearchExec,
} from "./web_search.js";
import {
  definition as webFetchDef,
  execute as webFetchExec,
} from "./web_fetch.js";
import {
  definition as readFileDef,
  execute as readFileExec,
} from "./read_file.js";
import { definition as listDef, execute as listExec } from "./list.js";
import { definition as grepDef, execute as grepExec } from "./grep.js";
import {
  definition as listChatsDef,
  execute as listChatsExec,
} from "./list_chats.js";
import {
  definition as searchChatsDef,
  execute as searchChatsExec,
} from "./search_chats.js";
import {
  definition as getChatDef,
  execute as getChatExec,
} from "./get_chat.js";
import {
  definition as writeFileDef,
  execute as writeFileExec,
} from "./write_file.js";
import {
  definition as applyPatchDef,
  execute as applyPatchExec,
} from "./apply_patch.js";
import { definition as bashDef, execute as bashExec } from "./bash.js";
import {
  definition as requestUserInputDef,
  execute as requestUserInputExec,
} from "./request_user_input.js";
import {
  definition as searchMemoriesDef,
  execute as searchMemoriesExec,
} from "./search_memories.js";
import {
  definition as createMemoryDef,
  execute as createMemoryExec,
} from "./create_memory.js";
import {
  definition as updateMemoryDef,
  execute as updateMemoryExec,
} from "./update_memory.js";
import {
  definition as deleteMemoryDef,
  execute as deleteMemoryExec,
} from "./delete_memory.js";
import {
  definition as createTodoDef,
  execute as createTodoExec,
} from "./create_todo.js";
import {
  definition as startPomodoroDef,
  execute as startPomodoroExec,
} from "./start_pomodoro.js";
import {
  definition as updateTodoDef,
  execute as updateTodoExec,
} from "./update_todo.js";
import {
  definition as completeTodoDef,
  execute as completeTodoExec,
} from "./complete_todo.js";
import {
  definition as listTodosDef,
  execute as listTodosExec,
} from "./list_todos.js";
import {
  definition as deleteTodoDef,
  execute as deleteTodoExec,
} from "./delete_todo.js";

// Order matters only for the Ollama tools array the model sees. The dispatcher
// looks tools up by name, so adding one here is the only wiring needed. Named
// (not namespace) imports collected into plain object literals so both knip and
// the bundler can trace the definition/execute usages.
const TOOLS: ToolModule[] = [
  { definition: captureScreenDef, execute: captureScreenExec },
  { definition: currentDateTimeDef, execute: currentDateTimeExec },
  { definition: webSearchDef, execute: webSearchExec },
  { definition: webFetchDef, execute: webFetchExec },
  { definition: readFileDef, execute: readFileExec },
  { definition: listDef, execute: listExec },
  { definition: grepDef, execute: grepExec },
  { definition: listChatsDef, execute: listChatsExec },
  { definition: searchChatsDef, execute: searchChatsExec },
  { definition: getChatDef, execute: getChatExec },
  { definition: writeFileDef, execute: writeFileExec },
  { definition: applyPatchDef, execute: applyPatchExec },
  { definition: bashDef, execute: bashExec },
  { definition: requestUserInputDef, execute: requestUserInputExec },
  { definition: searchMemoriesDef, execute: searchMemoriesExec },
  { definition: createMemoryDef, execute: createMemoryExec },
  { definition: updateMemoryDef, execute: updateMemoryExec },
  { definition: deleteMemoryDef, execute: deleteMemoryExec },
  { definition: createTodoDef, execute: createTodoExec },
  { definition: startPomodoroDef, execute: startPomodoroExec },
  { definition: updateTodoDef, execute: updateTodoExec },
  { definition: completeTodoDef, execute: completeTodoExec },
  { definition: listTodosDef, execute: listTodosExec },
  { definition: deleteTodoDef, execute: deleteTodoExec },
];

const byName = new Map(TOOLS.map((t) => [t.definition.function.name, t]));

export const TOOL_DEFINITIONS: ToolDefinition[] = TOOLS.map(
  (t) => t.definition,
);

export async function runTool(
  name: string,
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = byName.get(name);
  if (!tool) {
    return {
      content: `Unknown tool: ${name}`,
      activity: { status: "error", error: `Unknown tool: ${name}` },
    };
  }
  return tool.execute(args, ctx);
}
