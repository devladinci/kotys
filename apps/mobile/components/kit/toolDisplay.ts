import type { Ionicons } from "@expo/vector-icons";
import type { ToolActivity } from "@kotys/contracts";

export type ToolTone = {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const MAX_QUERY_LEN = 42;
const TRUNCATED_QUERY_LEN = 40;

export function toolTone(
  call: ToolActivity,
  accent: string,
  muted: string,
): ToolTone {
  if (call.status === "error")
    return { color: "#ef4444", icon: "alert-circle-outline" };
  const tool = call.tool;
  if (tool.startsWith("web_"))
    return { color: "#10b981", icon: "globe-outline" };
  if (tool === "bash") return { color: "#8b5cf6", icon: "terminal-outline" };
  if (tool === "write_file" || tool === "apply_patch")
    return { color: "#f59e0b", icon: "create-outline" };
  if (tool === "read_file" || tool === "list" || tool === "grep")
    return { color: accent, icon: "document-text-outline" };
  if (tool.includes("memory") || tool === "search_memories")
    return { color: "#ec4899", icon: "headset-outline" };
  if (tool.includes("todo"))
    return { color: "#14b8a6", icon: "checkbox-outline" };
  if (tool.includes("pomodoro"))
    return { color: "#f97316", icon: "timer-outline" };
  if (tool.includes("chat") || tool === "request_user_input")
    return { color: accent, icon: "chatbubble-ellipses-outline" };
  if (call.server) return { color: muted, icon: "cube-outline" };
  return { color: muted, icon: "flash-outline" };
}

export function humanizeTool(call: ToolActivity): string {
  const query = typeof call.query === "string" ? call.query.trim() : "";
  if (query)
    return query.length > MAX_QUERY_LEN
      ? query.slice(0, TRUNCATED_QUERY_LEN) + "…"
      : query;
  if (call.url) {
    try {
      return new URL(call.url).hostname + new URL(call.url).pathname;
    } catch {
      return call.url;
    }
  }
  if (call.filePath) return call.filePath.split("/").pop() ?? call.filePath;
  return call.tool.replace(/_/g, " ").replace(/^mcp /, "");
}
