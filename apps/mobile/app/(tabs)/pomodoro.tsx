import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  usePomodoroStore,
  BREAK_BOUNDS,
  CYCLE_BOUNDS,
  CYCLE_PRESETS,
  BREAK_PRESETS,
  FOCUS_BOUNDS,
  FOCUS_PRESETS,
} from "@kotys/core";
import type { PomodoroSessionRecord } from "@kotys/contracts";
import { theme, useThemeMode } from "../../lib/theme";
import { fmtHistoryDate } from "../../lib/pomodoro/format";

export default function PomodoroScreen() {
  const mode = useThemeMode();
  const t = theme(mode);
  const pom = usePomodoroStore();
  const [task, setTask] = useState("");
  // Seeded from the daemon-hydrated defaults on first mount; the user's
  // in-form edits win afterwards (no mid-typing resets).
  const [focus, setFocus] = useState(() => {
    const d = usePomodoroStore.getState().defaultDuration;
    return d > 0 ? String(d) : "25";
  });
  const [brk, setBrk] = useState(() => {
    const d = usePomodoroStore.getState().defaultBreak;
    return d >= 0 ? String(d) : "5";
  });
  const [cycles, setCycles] = useState("2");
  const [savedFlash, setSavedFlash] = useState(false);

  const session = pom.session;

  const start = () => {
    void pom
      .start({
        task: task.trim() || undefined,
        duration_minutes: clampNum(
          focus,
          FOCUS_BOUNDS.min,
          FOCUS_BOUNDS.max,
          25,
        ),
        break_minutes: clampNum(brk, BREAK_BOUNDS.min, BREAK_BOUNDS.max, 5),
        cycles: clampNum(cycles, CYCLE_BOUNDS.min, CYCLE_BOUNDS.max, 2),
      })
      .catch(() => pom.setError("Could not start the session."));
  };

  const history = useMemo(
    () =>
      pom.history
        .filter((h) => h.status === "completed" || h.status === "cancelled")
        .slice(0, 12),
    [pom.history],
  );

  const saveDefaults = () => {
    void pom.setDefaults(
      clampNum(focus, FOCUS_BOUNDS.min, FOCUS_BOUNDS.max, 25),
      clampNum(brk, BREAK_BOUNDS.min, BREAK_BOUNDS.max, 5),
    );
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      {session && pom.phase ? (
        <RunningCard pom={pom} t={t} />
      ) : (
        <View
          style={[
            s.card,
            { backgroundColor: t.surface, borderColor: t.border },
          ]}
        >
          <Text style={[s.heading, { color: t.text }]}>Start focus</Text>
          <TextInput
            value={task}
            onChangeText={setTask}
            placeholder="What are you focusing on? (optional)"
            placeholderTextColor={t.textMuted}
            style={[
              s.input,
              { color: t.text, borderColor: t.border, backgroundColor: t.bg },
            ]}
          />
          <DurationRow
            label="Focus"
            presets={FOCUS_PRESETS}
            value={focus}
            onChange={setFocus}
            unit="min"
            themed={t}
          />
          <DurationRow
            label="Break"
            presets={BREAK_PRESETS}
            value={brk}
            onChange={setBrk}
            unit="min"
            themed={t}
          />
          <DurationRow
            label="Cycles"
            presets={CYCLE_PRESETS}
            value={cycles}
            onChange={setCycles}
            unit="×"
            themed={t}
          />
          <Pressable
            onPress={start}
            style={[s.primaryBtn, { backgroundColor: t.accent }]}
            accessibilityRole="button"
            accessibilityLabel="Start focus session"
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
              Start {clampNum(focus, FOCUS_BOUNDS.min, FOCUS_BOUNDS.max, 25)}m
              focus
            </Text>
          </Pressable>
          <Pressable onPress={saveDefaults} hitSlop={6}>
            <Text
              style={{ color: t.textMuted, fontSize: 12, textAlign: "center" }}
            >
              {savedFlash ? "Saved ✓" : "Save these as defaults"}
            </Text>
          </Pressable>
        </View>
      )}

      {history.length > 0 ? (
        <View
          style={[
            s.card,
            { backgroundColor: t.surface, borderColor: t.border },
          ]}
        >
          <Text style={[s.heading, { color: t.text }]}>Recent sessions</Text>
          {history.map((h) => (
            <HistoryRow key={h.id} h={h} themed={t} />
          ))}
        </View>
      ) : null}

      {pom.error ? (
        <Pressable onPress={() => pom.setError(null)}>
          <Text style={{ color: t.danger, fontSize: 13, textAlign: "center" }}>
            {pom.error}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function clampNum(
  v: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function DurationRow({
  label,
  presets,
  value,
  onChange,
  unit,
  themed,
}: {
  label: string;
  presets: number[];
  value: string;
  onChange: (v: string) => void;
  unit: string;
  themed: ReturnType<typeof theme>;
}) {
  const t = themed;
  const num = Number(value) || 0;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: "600" }}>
        {label.toUpperCase()}
      </Text>
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
        {presets.map((p) => (
          <Pressable
            key={p}
            onPress={() => onChange(String(p))}
            style={[
              s.chip,
              {
                borderColor: num === p ? t.accent : t.border,
                backgroundColor: num === p ? t.accent : "transparent",
              },
            ]}
          >
            <Text
              style={{
                color: num === p ? "#fff" : t.text,
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              {p}
            </Text>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <TextInput
          value={value}
          onChangeText={(v) => onChange(v.replace(/[^0-9]/g, ""))}
          keyboardType="number-pad"
          style={[
            s.numInput,
            { color: t.text, borderColor: t.border, backgroundColor: t.bg },
          ]}
        />
        <Text style={{ color: t.textMuted, fontSize: 12, width: 14 }}>
          {unit}
        </Text>
      </View>
    </View>
  );
}

type PomStore = {
  session: PomodoroSessionRecord | null;
  phase: "focus" | "break" | undefined;
  remaining: number;
  history: PomodoroSessionRecord[];
  error: string | null;
  start: (opts: {
    task?: string;
    todo_id?: number;
    duration_minutes?: number;
    break_minutes?: number;
    cycles?: number;
  }) => Promise<unknown>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  skipBreak: () => void;
  setError: (e: string | null) => void;
};

function RunningCard({
  pom,
  t,
}: {
  pom: PomStore;
  t: ReturnType<typeof theme>;
}) {
  const session = pom.session as PomodoroSessionRecord;
  const isBreak = pom.phase === "break";
  const mm = Math.floor(pom.remaining / 60);
  const ss = pom.remaining % 60;
  const focusDone = session.cycles_completed;
  const total = session.cycles;
  const running = session.status === "running";
  return (
    <View
      style={[
        s.card,
        s.runningCard,
        { backgroundColor: t.surface, borderColor: isBreak ? t.ok : t.accent },
      ]}
    >
      <Text
        style={{
          color: isBreak ? t.ok : t.accent,
          fontWeight: "700",
          fontSize: 13,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {isBreak ? "Break" : "Focus"}
      </Text>
      <Text
        style={{
          color: t.text,
          fontSize: 76,
          fontWeight: "200",
          fontVariant: ["tabular-nums"],
          textAlign: "center",
        }}
      >
        {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
      </Text>
      {session.task ? (
        <Text
          numberOfLines={1}
          style={{ color: t.textMuted, fontSize: 14, marginBottom: 6 }}
        >
          {session.task}
        </Text>
      ) : null}
      {total > 1 ? (
        <View style={{ flexDirection: "row", gap: 5, marginBottom: 12 }}>
          {Array.from({ length: Math.min(total, 8) }, (_, i) => (
            <View
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor:
                  i < focusDone ? (isBreak ? t.ok : t.accent) : t.border,
              }}
            />
          ))}
          <Text style={{ color: t.textMuted, fontSize: 11, marginLeft: 4 }}>
            {focusDone} of {total}
          </Text>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => (running ? void pom.pause() : void pom.resume())}
          style={[s.controlBtn, { borderColor: t.border, flex: 1 }]}
        >
          <Ionicons
            name={running ? "pause" : "play"}
            size={16}
            color={t.text}
          />
          <Text style={{ color: t.text, fontWeight: "600", fontSize: 14 }}>
            {running ? "Pause" : "Resume"}
          </Text>
        </Pressable>
        {isBreak ? (
          <Pressable
            onPress={() => void pom.skipBreak()}
            style={[s.controlBtn, { borderColor: t.border, flex: 1 }]}
          >
            <Ionicons
              name="play-skip-forward-outline"
              size={16}
              color={t.text}
            />
            <Text style={{ color: t.text, fontWeight: "600", fontSize: 14 }}>
              Skip
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => void pom.stop()}
          style={[s.controlBtn, { borderColor: t.danger, flex: 1 }]}
        >
          <Ionicons name="stop" size={16} color={t.danger} />
          <Text style={{ color: t.danger, fontWeight: "600", fontSize: 14 }}>
            Stop
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function HistoryRow({
  h,
  themed,
}: {
  h: PomodoroSessionRecord;
  themed: ReturnType<typeof theme>;
}) {
  const t = themed;
  const label = h.status === "completed" ? "Completed" : "Stopped";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 7,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: t.border,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: t.text, fontSize: 14 }}>
          {h.task ?? "Focus"}
        </Text>
        <Text style={{ color: t.textMuted, fontSize: 11 }}>
          {fmtHistoryDate(h.started_at)}
        </Text>
      </View>
      <Text style={{ color: t.textMuted, fontSize: 12 }}>
        {Math.round(h.duration_seconds / 60)}m
      </Text>
      <Text
        style={{
          color: h.status === "completed" ? t.ok : t.textMuted,
          fontSize: 11,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  runningCard: { alignItems: "center", borderWidth: 1 },
  heading: { fontSize: 17, fontWeight: "700" },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  numInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 14,
    width: 48,
    textAlign: "center",
  },
  primaryBtn: {
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 12,
  },
  controlBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignItems: "center",
  },
});
