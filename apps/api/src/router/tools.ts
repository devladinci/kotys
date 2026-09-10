import { TOOL_DEFINITIONS } from "../tools/index.js";
import type { ToolListing } from "@kotys/contracts";
import { pub } from "./base.js";

export const toolsRouter = {
  list: pub.handler(async () =>
    TOOL_DEFINITIONS.map((t): ToolListing => ({
      name: t.function.name,
      description: t.function.description,
      category: t.category ?? null,
    })),
  ),
};
