import type { ComponentType } from "react";
import type { ToolActivity } from "@kotys/contracts";
import InputCard from "./InputCard";
import TodoCard from "./TodoCard";

export type ChatWidget = NonNullable<ToolActivity["widget"]>;

// A new kind in the contracts union is a compile error until its card is here.
const REGISTRY = {
  todo: TodoCard,
  input: InputCard,
} satisfies {
  [K in ChatWidget["kind"]]: ComponentType<{
    widget: Extract<ChatWidget, { kind: K }>;
  }>;
};

export function WidgetFor({ widget }: { widget: ChatWidget }) {
  // Persisted toolCalls JSON bypasses zod, so a newer build's kind may be
  // unknown here — drop the card rather than crash the chat.
  const Component = REGISTRY[widget.kind] as ComponentType<{
    widget: ChatWidget;
  }> | null;
  if (!Component) return null;
  return <Component widget={widget} />;
}
