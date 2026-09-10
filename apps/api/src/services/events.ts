import { EventEmitter } from "node:events";
import type {
  ApprovalRequest,
  InputRequest,
  PomodoroPhase,
  PomodoroSessionRecord,
  StreamChunk,
  ToolEvent,
} from "@kotys/contracts";

type ServerEvents = {
  "chat:chunk": [StreamChunk];
  "chat:tool": [ToolEvent];
  "chat:done": [{ requestId: number }];
  "chat:error": [{ requestId: number; error: string }];

  "chats:changed": [{ chatId?: number }];

  "messages:changed": [{ chatId: number; messageId: number }];

  "messages:progress": [{ chatId: number; messageId: number }];

  "approval:request": [ApprovalRequest];
  "approval:cancel": [{ id: number }];

  "input:request": [InputRequest];
  "input:cancel": [{ id: number }];

  "pomodoro:tick": [
    { session: PomodoroSessionRecord; phase: PomodoroPhase; remaining: number },
  ];
  "pomodoro:started": [PomodoroSessionRecord];
  "pomodoro:done": [PomodoroSessionRecord];

  "todos:changed": [];
  "todos:open": [{ todoId: number }];

  "skills:changed": [];

  "open-url": [{ url: string }];

  notify: [{ title: string; body: string; at?: number; todoId?: number }];
};

class TypedEmitter extends EventEmitter {
  emitEvent<K extends keyof ServerEvents>(
    event: K,
    ...args: ServerEvents[K]
  ): void {
    this.emit(event as string, ...args);
  }

  onEvent<K extends keyof ServerEvents>(
    event: K,
    listener: (...args: ServerEvents[K]) => void,
  ): () => void {
    this.on(event as string, listener as (...a: unknown[]) => void);
    return () => {
      this.off(event as string, listener as (...a: unknown[]) => void);
    };
  }
}

export const events = new TypedEmitter();
events.setMaxListeners(50);
