import { createContext } from "react";
import type { ISpeechHookResult } from "@saystack/react";

export interface IReadAloud {
  speech: ISpeechHookResult;
  messageId: number | null;
  isSummary: boolean;
  anchor: Element | null;
  readLevels: () => ArrayLike<number> | undefined;
  speak: (messageId: number, markdown: string) => void;
  anchorMessage: (element: Element) => () => void;
}

export const ReadAloudContext = createContext<IReadAloud | null>(null);
