import { getAnalyticsOverview } from "@kotys/db";
import { TOOL_DEFINITIONS } from "../tools/index.js";
import { pub } from "./base.js";

export const analyticsRouter = {
  overview: pub.handler(async () =>
    getAnalyticsOverview(TOOL_DEFINITIONS.map((t) => t.function.name)),
  ),
};
