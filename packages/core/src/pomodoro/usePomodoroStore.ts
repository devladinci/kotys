import { create } from "zustand";
import type { PomodoroPhase, PomodoroSessionRecord } from "@kotys/contracts";
import { getRpc, getSocket } from "../shared/clients.js";
import { useTodoStore } from "../todos/useTodoStore.js";

export type { PomodoroPhase };

interface PomodoroState {
  session: PomodoroSessionRecord | null;
  phase: PomodoroPhase;
  remaining: number;
  /**
   * Collapsed shows the running session as a one-line strip rather than the
   * full panel. It never hides a live timer — that was the floating widget's
   * failure mode, where closing it left a session running off-screen.
   */
  collapsed: boolean;
  history: PomodoroSessionRecord[];
  loading: boolean;
  error: string | null;
  defaultDuration: number;
  defaultBreak: number;

  hydrate: () => Promise<void>;
  loadActive: () => Promise<void>;
  loadHistory: () => Promise<void>;
  start: (opts: {
    task?: string;
    duration_minutes?: number;
    break_minutes?: number;
    cycles?: number;
    todo_id?: number;
    chat_id?: number;
  }) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  skipBreak: () => Promise<void>;
  setCollapsed: (collapsed: boolean) => void;
  /** Bring the panel into view: open the rail and expand the section. */
  reveal: () => void;
  setDefaults: (duration: number, breakDuration: number) => Promise<void>;
  setError: (error: string | null) => void;
  adopt: (session: PomodoroSessionRecord) => void;
  applyTick: (event: {
    session: PomodoroSessionRecord;
    phase: PomodoroPhase;
    remaining: number;
  }) => void;
}

const COLLAPSED_SETTING = "pomodoro_focus_collapsed";
const DURATION_SETTING = "pomodoro_duration_minutes";
const BREAK_SETTING = "pomodoro_break_minutes";

// Kept in step with the form and settings inputs, which offer the same ranges.
const DURATION_BOUNDS = { min: 1, max: 120 };
const BREAK_BOUNDS = { min: 0, max: 60 };

const message = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const clampMinutes = (
  value: number,
  { min, max }: { min: number; max: number },
  fallback: number,
) =>
  Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;

/**
 * The server owns the countdown, but the widget has to render something
 * the moment it mounts — before the first tick lands. Reading the same
 * wall-clock deadline it does keeps the two from disagreeing.
 */
const remainingFor = (session: PomodoroSessionRecord): number => {
  if (session.status === "paused") {
    return Math.max(0, session.remaining_at_pause ?? 0);
  }
  if (session.status !== "running" || session.ends_at === null) return 0;
  return Math.max(0, Math.ceil(session.ends_at - Date.now() / 1000));
};

export const usePomodoroStore = create<PomodoroState>((set, get) => ({
  session: null,
  phase: "focus",
  remaining: 0,
  collapsed: false,
  history: [],
  loading: false,
  error: null,
  defaultDuration: 25,
  defaultBreak: 5,

  hydrate: async () => {
    try {
      const rpc = getRpc();
      const [collapsedRaw, durationRaw, breakRaw] = await Promise.all([
        rpc.settings.get({ key: COLLAPSED_SETTING }),
        rpc.settings.get({ key: DURATION_SETTING }),
        rpc.settings.get({ key: BREAK_SETTING }),
      ]);
      set({
        collapsed: collapsedRaw.value === "true",
        defaultDuration: clampMinutes(
          Number(durationRaw.value),
          DURATION_BOUNDS,
          25,
        ),
        defaultBreak: clampMinutes(Number(breakRaw.value), BREAK_BOUNDS, 5),
      });
      await get().loadActive();
      await get().loadHistory();
    } catch (err) {
      set({ error: message(err) });
    }
  },

  loadActive: async () => {
    try {
      const session = await getRpc().pomodoro.active();
      set({
        session,
        phase: session?.phase ?? "focus",
        remaining: session ? remainingFor(session) : 0,
        error: null,
      });
    } catch (err) {
      set({ error: message(err) });
    }
  },

  loadHistory: async () => {
    try {
      const history = await getRpc().pomodoro.sessions({ limit: 20 });
      set({ history, error: null });
    } catch (err) {
      set({ error: message(err) });
    }
  },

  start: async (opts) => {
    set({ loading: true });
    try {
      const session = await getRpc().pomodoro.start({
        chat_id: opts.chat_id ?? null,
        todo_id: opts.todo_id ?? null,
        task: opts.task ?? null,
        duration_seconds:
          opts.duration_minutes !== undefined
            ? Math.round(opts.duration_minutes * 60)
            : undefined,
        break_seconds:
          opts.break_minutes !== undefined
            ? Math.round(opts.break_minutes * 60)
            : undefined,
        cycles: opts.cycles,
      });
      get().adopt(session);
      get().reveal();
      void get().loadHistory();
    } catch (err) {
      set({ error: message(err) });
    } finally {
      set({ loading: false });
    }
  },

  pause: async () => {
    try {
      const session = await getRpc().pomodoro.pause();
      if (session) get().adopt(session);
    } catch (err) {
      set({ error: message(err) });
    }
  },

  resume: async () => {
    try {
      const session = await getRpc().pomodoro.resume();
      if (session) get().adopt(session);
    } catch (err) {
      set({ error: message(err) });
    }
  },

  stop: async () => {
    try {
      const session = await getRpc().pomodoro.stop();
      if (session) {
        get().adopt(session);
        void get().loadHistory();
      }
    } catch (err) {
      set({ error: message(err) });
    }
  },

  skipBreak: async () => {
    try {
      const session = await getRpc().pomodoro.skipBreak();
      if (session) get().adopt(session);
    } catch (err) {
      set({ error: message(err) });
    }
  },

  setCollapsed: (collapsed) => {
    set({ collapsed });
    void getRpc()
      .settings.set({ key: COLLAPSED_SETTING, value: String(collapsed) })
      .catch(() => undefined);
  },

  reveal: () => {
    useTodoStore.getState().setSidebarOpen(true);
    get().setCollapsed(false);
  },

  setDefaults: async (duration, breakDuration) => {
    const clampedDuration = clampMinutes(duration, DURATION_BOUNDS, 25);
    const clampedBreak = clampMinutes(breakDuration, BREAK_BOUNDS, 5);
    set({
      defaultDuration: clampedDuration,
      defaultBreak: clampedBreak,
    });
    const rpc = getRpc();
    await Promise.all([
      rpc.settings.set({
        key: DURATION_SETTING,
        value: String(clampedDuration),
      }),
      rpc.settings.set({ key: BREAK_SETTING, value: String(clampedBreak) }),
    ]);
  },

  setError: (error) => set({ error }),

  adopt: (session) => {
    set({
      session,
      phase: session.phase,
      remaining: remainingFor(session),
      error: null,
    });
  },

  applyTick: (event) => {
    set({
      session: event.session,
      phase: event.phase,
      remaining: event.remaining,
    });
  },
}));

let subscribed = false;
export const subscribePomodoro = () => {
  if (subscribed) return;
  subscribed = true;
  const socket = getSocket();
  socket.on((msg) => {
    if (msg.type === "pomodoro:tick") {
      usePomodoroStore.getState().applyTick(msg.payload);
    }
    if (msg.type === "pomodoro:done") {
      usePomodoroStore.getState().adopt(msg.payload);
      void usePomodoroStore.getState().loadHistory();
    }
    // A session the model started: surface the widget, since the user did not
    // open it themselves and would otherwise get a timer with nothing on screen.
    if (msg.type === "pomodoro:started") {
      const s = usePomodoroStore.getState();
      s.adopt(msg.payload);
      s.reveal();
      void s.loadHistory();
    }
  });
};
