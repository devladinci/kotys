import type {
  ApprovalRequest,
  ChatStreamResult,
  CreatePomodoroSessionInput,
  InputRequest,
  PomodoroPhase,
  PomodoroSessionRecord,
  StreamRequest,
  ToolEvent,
} from "@kotys/contracts";

export type ClientMessage =
  | { type: "chat:stream"; payload: StreamRequest }
  | { type: "chat:abort"; payload: { requestId: number } }
  /** Sent after reconnecting: replay everything past lastSeq. */
  | { type: "chat:resume"; payload: { requestId: number; lastSeq: number } }
  /** Heartbeat from clients probing a possibly half-dead socket. */
  | { type: "ping" }
  | { type: "approval:response"; payload: { id: number; approved: boolean } }
  | {
      type: "input:response";
      payload: {
        id: number;
        answers?: Record<string, string>;
        cancelled?: boolean;
      };
    }
  | { type: "pomodoro:start"; payload: CreatePomodoroSessionInput }
  | { type: "pomodoro:pause" }
  | { type: "pomodoro:resume" }
  | { type: "pomodoro:stop" }
  | { type: "pomodoro:skip-break" };

export type ServerMessage =
  | { type: "ready"; payload: { clientId: string } }
  | { type: "pong" }
  | {
      type: "chat:chunk";
      seq: number;
      /** Chat the streamed assistant message belongs to, when known. */
      chatId?: number;
      payload: {
        requestId: number;
        thinkingDelta: string;
        contentDelta: string;
      };
    }
  | {
      type: "chat:tool";
      seq: number;
      chatId?: number;
      payload: ToolEvent;
    }
  | {
      type: "chat:done";
      seq: number;
      chatId?: number;
      payload: { requestId: number; result: ChatStreamResult };
    }
  | {
      type: "chat:error";
      seq: number;
      chatId?: number;
      payload: { requestId: number; error: string };
    }
  | { type: "chats:changed"; payload: { chatId?: number } }
  | { type: "messages:changed"; payload: { chatId: number; messageId: number } }
  | {
      /** 1s streaming-progress pulse; never triggers a chat-wide refetch. */
      type: "messages:progress";
      payload: { chatId: number; messageId: number };
    }
  | { type: "approval:request"; payload: ApprovalRequest }
  | { type: "approval:cancel"; payload: { id: number } }
  | { type: "input:request"; payload: InputRequest }
  | { type: "input:cancel"; payload: { id: number } }
  | {
      type: "pomodoro:tick";
      payload: {
        session: PomodoroSessionRecord;
        phase: PomodoroPhase;
        remaining: number;
      };
    }
  | { type: "pomodoro:started"; payload: PomodoroSessionRecord }
  | { type: "pomodoro:done"; payload: PomodoroSessionRecord }
  | { type: "todos:changed" }
  | { type: "todos:open"; payload: { todoId: number } }
  | { type: "skills:changed" }
  | { type: "open-url"; payload: { url: string } }
  | {
      type: "notify";
      payload: { title: string; body: string; at?: number; todoId?: number };
    };
