import type { ComponentType } from "react";
import type { ToolActivity } from "@kotys/contracts";
import InputCard from "./InputCard";
import TodoCard from "./TodoCard";
import ImageCard from "./ImageCard";
import { SteerCard } from "./SteerCard";

type ChatWidget = NonNullable<ToolActivity["widget"]>;

interface IProps<W extends ChatWidget = ChatWidget> {
  widget: W;
}

// A new kind in the contracts union is a compile error until its card is here.
const REGISTRY = {
  todo: TodoCard,
  input: InputCard,
  image: ImageCard,
  steer: SteerCard,
} satisfies {
  [K in ChatWidget["kind"]]: ComponentType<
    IProps<Extract<ChatWidget, { kind: K }>>
  >;
};

export function WidgetFor({ widget }: IProps) {
  // Persisted toolCalls bypass zod, so a newer build's kind can be unknown here.
  const Component = REGISTRY[widget.kind] as ComponentType<IProps> | null;
  if (!Component) return null;
  return <Component widget={widget} />;
}
