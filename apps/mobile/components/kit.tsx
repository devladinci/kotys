import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  PERMISSION_MODES,
  THINKING_EFFORTS,
  useAppStore,
  useModels,
  formatDuration,
} from "@kotys/core";
import type {
  InputWidget,
  ModelListing,
  PermissionMode,
  ThinkEffort,
  ToolActivity,
} from "@kotys/contracts";
import { fmtTokens } from "@kotys/contracts";
import { theme, useThemeMode } from "../lib/theme";

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const mode = useThemeMode();
  const t = theme(mode);
  const inset = useBottomSpace();
  const [appear] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      appear.setValue(0);
      Animated.timing(appear, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, appear]);

  if (!visible) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={sh.container}>
        <Animated.View style={[sh.backdrop, { opacity: appear }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            sh.sheet,
            {
              backgroundColor: t.surface,
              paddingBottom: Math.max(inset, 12),
              transform: [
                {
                  translateY: appear.interpolate({
                    inputRange: [0, 1],
                    outputRange: [400, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={sh.grabber}>
            <View style={[sh.grabberBar, { backgroundColor: t.border }]} />
          </View>
          <View style={sh.headerRow}>
            <Text style={[sh.title, { color: t.text }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={t.textMuted} />
            </Pressable>
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

function CapabilityIcons({
  model,
  color,
}: {
  model: ModelListing;
  color: string;
}) {
  const provider = model.provider ?? "ollama";
  return (
    <View style={pk.caps}>
      {model.capabilities.includes("vision") ? (
        <Ionicons name="eye-outline" size={13} color={color} />
      ) : null}
      {model.capabilities.includes("tools") ? (
        <Ionicons name="construct-outline" size={13} color={color} />
      ) : null}
      {model.capabilities.includes("thinking") ? (
        <Ionicons name="sparkles-outline" size={13} color={color} />
      ) : null}
      <Text
        style={[
          pk.srcBadge,
          {
            color,
            borderColor: color,
            opacity: model.source === "local" ? 1 : 0.6,
          },
        ]}
      >
        {provider === "omlx"
          ? "OMLX"
          : model.source === "local"
            ? "LOCAL"
            : "CLOUD"}
      </Text>
    </View>
  );
}

export function ModelPickers(props: {
  chatModel: ModelListing;
  onSelectModel: (m: ModelListing) => void | Promise<void>;
  visible: boolean;
  onClose: () => void;
}) {
  const models = useModels();
  const mode = useThemeMode();
  const t = theme(mode);
  const defaultModel = useAppStore((s) => s.defaultModel);
  const setDefaultModel = useAppStore((s) => s.setDefaultModel);
  const [query, setQuery] = useState("");

  const filtered = models.filter((m) =>
    m.name.toLowerCase().includes(query.toLowerCase()),
  );

  const pick = async (m: ModelListing) => {
    setDefaultModel(m);
    await props.onSelectModel(m);
    props.onClose();
  };

  return (
    <Sheet visible={props.visible} onClose={props.onClose} title="Model">
      <View
        style={[
          pk.search,
          { borderColor: t.border, backgroundColor: t.surface2 },
        ]}
      >
        <Ionicons name="search" size={15} color={t.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search models…"
          placeholderTextColor={t.textMuted}
          style={{ flex: 1, color: t.text, fontSize: 14 }}
          autoCorrect={false}
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={t.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView style={pk.list}>
        {filtered.map((m) => {
          const active =
            m.name === props.chatModel.name &&
            (m.provider ?? "ollama") === (props.chatModel.provider ?? "ollama");
          return (
            <Pressable
              key={`${m.provider ?? "ollama"}:${m.name}:${m.source}`}
              style={[pk.row, active && { backgroundColor: t.surface2 }]}
              onPress={() => void pick(m)}
            >
              <View style={{ flex: 1 }}>
                <View style={pk.nameRow}>
                  <Text
                    numberOfLines={1}
                    style={[pk.name, { color: active ? t.accent : t.text }]}
                  >
                    {m.name}
                  </Text>
                  {m.name === defaultModel.name ? (
                    <Text style={[pk.defTag, { color: t.textMuted }]}>
                      default
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={{ color: t.textMuted, fontSize: 10, marginTop: 1 }}
                >
                  provider: {m.provider ?? "ollama"}
                </Text>
                <CapabilityIcons model={m} color={t.textMuted} />
              </View>
              {active ? (
                <Ionicons name="checkmark" size={18} color={t.accent} />
              ) : null}
            </Pressable>
          );
        })}
        {filtered.length === 0 ? (
          <Text style={[pk.empty, { color: t.textMuted }]}>
            {models.length === 0
              ? "No models available"
              : `No models match "${query}"`}
          </Text>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

const THINK_LABELS: Record<ThinkEffort, { label: string; hint: string }> = {
  off: { label: "off", hint: "No reasoning" },
  low: { label: "low", hint: "Quick reasoning" },
  medium: { label: "medium", hint: "Balanced reasoning" },
  high: { label: "high", hint: "Deep reasoning" },
  max: { label: "max", hint: "Maximum reasoning" },
};

export function ThinkingPicker(props: {
  model: ModelListing;
  visible: boolean;
  onClose: () => void;
}) {
  const mode = useThemeMode();
  const t = theme(mode);
  const thinkingEffort = useAppStore((s) => s.thinkingEffort);
  const setThinkingEffort = useAppStore((s) => s.setThinkingEffort);
  if (!props.model.capabilities.includes("thinking")) return null;
  return (
    <Sheet
      visible={props.visible}
      onClose={props.onClose}
      title="Thinking effort"
    >
      {THINKING_EFFORTS.map((e) => {
        const active = e === thinkingEffort;
        return (
          <Pressable
            key={e}
            style={pk.row}
            onPress={() => {
              setThinkingEffort(e);
              props.onClose();
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={[pk.name, { color: active ? t.accent : t.text }]}>
                {THINK_LABELS[e].label}
              </Text>
              <Text style={{ color: t.textMuted, fontSize: 12 }}>
                {THINK_LABELS[e].hint}
              </Text>
            </View>
            {active ? (
              <Ionicons name="checkmark" size={18} color={t.accent} />
            ) : null}
          </Pressable>
        );
      })}
    </Sheet>
  );
}

const MODE_ICONS: Record<PermissionMode, keyof typeof Ionicons.glyphMap> = {
  ask: "help-circle-outline",
  copilot: "airplane-outline",
  autopilot: "rocket-outline",
};

const MODE_LABELS: Record<PermissionMode, { label: string; hint: string }> = {
  ask: { label: "ask", hint: "Confirm every tool use" },
  copilot: { label: "copilot", hint: "Reads freely, asks before writes" },
  autopilot: { label: "autopilot", hint: "Reads and writes without asking" },
};

export function ModePicker(props: { visible: boolean; onClose: () => void }) {
  const mode = useThemeMode();
  const t = theme(mode);
  const permissionMode = useAppStore((s) => s.permissionMode);
  const setPermissionMode = useAppStore((s) => s.setPermissionMode);
  return (
    <Sheet
      visible={props.visible}
      onClose={props.onClose}
      title="Permission mode"
    >
      {PERMISSION_MODES.map((m) => {
        const active = m === permissionMode;
        return (
          <Pressable
            key={m}
            style={pk.row}
            onPress={() => {
              setPermissionMode(m);
              props.onClose();
            }}
          >
            <Ionicons
              name={MODE_ICONS[m]}
              size={16}
              color={
                m === "autopilot"
                  ? "#10b981"
                  : m === "copilot"
                    ? t.accent
                    : t.textMuted
              }
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[pk.name, { color: active ? t.accent : t.text }]}>
                {MODE_LABELS[m].label}
              </Text>
              <Text style={{ color: t.textMuted, fontSize: 12 }}>
                {MODE_LABELS[m].hint}
              </Text>
            </View>
            {active ? (
              <Ionicons name="checkmark" size={18} color={t.accent} />
            ) : null}
          </Pressable>
        );
      })}
    </Sheet>
  );
}

type ToolTone = { color: string; icon: string };

function toolTone(tc: ToolActivity, accent: string, muted: string): ToolTone {
  if (tc.status === "error")
    return { color: "#ef4444", icon: "alert-circle-outline" };
  const t = tc.tool;
  if (t.startsWith("web_")) return { color: "#10b981", icon: "globe-outline" };
  if (t === "bash") return { color: "#8b5cf6", icon: "terminal-outline" };
  if (t === "write_file" || t === "apply_patch")
    return { color: "#f59e0b", icon: "create-outline" };
  if (t === "read_file" || t === "list" || t === "grep")
    return { color: accent, icon: "document-text-outline" };
  if (t.includes("memory") || t === "search_memories")
    return { color: "#ec4899", icon: "headset-outline" };
  if (t.includes("todo")) return { color: "#14b8a6", icon: "checkbox-outline" };
  if (t.includes("pomodoro"))
    return { color: "#f97316", icon: "timer-outline" };
  if (t.includes("chat") || t === "request_user_input")
    return { color: accent, icon: "chatbubble-ellipses-outline" };
  if (tc.server) return { color: muted, icon: "cube-outline" };
  return { color: muted, icon: "flash-outline" };
}

function humanizeTool(tc: ToolActivity): string {
  const t = tc.tool;
  const q = typeof tc.query === "string" ? tc.query.trim() : "";
  if (q) return q.length > 42 ? q.slice(0, 40) + "…" : q;
  if (tc.url) {
    try {
      return new URL(tc.url).hostname + new URL(tc.url).pathname;
    } catch {
      return tc.url;
    }
  }
  if (tc.filePath) return tc.filePath.split("/").pop() ?? tc.filePath;
  return t.replace(/_/g, " ").replace(/^mcp /, "");
}

function ToolCallRow({
  tc,
  streaming,
}: {
  tc: ToolActivity;
  streaming: boolean;
}) {
  const mode = useThemeMode();
  const t = theme(mode);
  const tone = toolTone(tc, t.accent, t.textMuted);
  const running = tc.status === "running" && streaming;
  const dur =
    tc.durationMs !== undefined ? formatDuration(tc.durationMs) : null;
  return (
    <View style={[tl.row, { borderColor: t.border }]}>
      <View style={[tl.iconWrap, { backgroundColor: `${tone.color}22` }]}>
        <View style={running ? tl.pulse : null}>
          <Ionicons name={tone.icon as never} size={13} color={tone.color} />
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            numberOfLines={1}
            style={{ color: t.text, fontSize: 13, flex: 1 }}
          >
            {humanizeTool(tc)}
          </Text>
          {tc.server ? (
            <Text
              style={[tl.server, { color: t.textMuted, borderColor: t.border }]}
            >
              {tc.server}
            </Text>
          ) : null}
          {tc.status === "error" ? (
            <Text style={{ color: t.danger, fontSize: 11, fontWeight: "600" }}>
              failed
            </Text>
          ) : null}
          {dur ? (
            <Text style={{ color: t.textMuted, fontSize: 11 }}>{dur}</Text>
          ) : null}
        </View>
        {tc.error ? (
          <Text numberOfLines={2} style={{ color: t.danger, fontSize: 11 }}>
            {tc.error}
          </Text>
        ) : null}
        {tc.images && tc.images.length > 0 ? (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 6,
            }}
          >
            {tc.images.map((img, i) => (
              <Image
                key={i}
                source={{ uri: `data:image/png;base64,${img}` }}
                style={{
                  width: 132,
                  height: 88,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: t.border,
                }}
                resizeMode="cover"
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function ToolTimeline({
  calls: raw,
  streaming,
}: {
  calls: ToolActivity[];
  streaming: boolean;
}) {
  const mode = useThemeMode();
  const t = theme(mode);
  const [expanded, setExpanded] = useState(false);
  const calls = raw.filter(Boolean);
  if (calls.length === 0) return null;
  const done = calls.filter((c) => c.status !== "running").length;
  const totalMs = calls.reduce((acc, c) => acc + (c.durationMs ?? 0), 0);
  const label = streaming
    ? `Using tools… ${calls.length}`
    : `${calls.length} tool${calls.length === 1 ? "" : "s"} · ${formatDuration(totalMs)} in tools`;
  return (
    <View>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={tl.strip}
        hitSlop={4}
      >
        <Ionicons name="hammer-outline" size={12} color={t.textMuted} />
        <Text style={{ color: t.textMuted, fontSize: 12 }}>{label}</Text>
        {done < calls.length || streaming ? (
          <ActivityIndicator size="small" color={t.textMuted} />
        ) : null}
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          color={t.textMuted}
        />
      </Pressable>
      {expanded ? (
        <View style={tl.list}>
          {calls.map((tc, i) => (
            <ToolCallRow key={i} tc={tc} streaming={streaming} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function TokenBadge({
  used,
  pct,
  ctx,
  compacted,
  isCompacting,
  onCompact,
}: {
  used: number;
  pct: number;
  /** The model's full context window. */
  ctx: number;
  compacted?: boolean;
  isCompacting?: boolean;
  onCompact?: () => void;
}) {
  const mode = useThemeMode();
  const t = theme(mode);
  const [sheetOpen, setSheetOpen] = useState(false);
  if (used <= 0 || ctx <= 0) return null;
  const color = pct >= 90 ? "#ef4444" : pct >= 75 ? "#f59e0b" : t.accent;
  return (
    <>
      <Pressable onPress={() => setSheetOpen(true)} hitSlop={8} style={tk.wrap}>
        <Ionicons name="pie-chart" size={13} color={color} />
        <Text
          style={{
            color,
            fontSize: 11,
            fontWeight: "600",
            fontVariant: ["tabular-nums"],
          }}
        >
          {pct}%
        </Text>
      </Pressable>
      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Context usage"
      >
        <Text style={[tk.big, { color }]}>
          {pct}% · {fmtTokens(used)} of {fmtTokens(ctx)}
        </Text>
        {compacted ? (
          <Text style={[tk.note, { color: t.textMuted }]}>
            Context compacted
          </Text>
        ) : null}
        <Text style={[tk.note, { color: t.textMuted }]}>
          When the context fills, older messages are summarized automatically to
          keep the conversation going.
        </Text>
        {onCompact ? (
          <Pressable
            disabled={isCompacting}
            onPress={() => {
              onCompact();
              setSheetOpen(false);
            }}
            style={[
              tk.btn,
              { backgroundColor: t.accent, opacity: isCompacting ? 0.6 : 1 },
            ]}
          >
            {isCompacting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>
                Compact now
              </Text>
            )}
          </Pressable>
        ) : null}
      </Sheet>
    </>
  );
}

import { useSafeAreaInsets } from "react-native-safe-area-context";
function useBottomSpace(): number {
  try {
    return useSafeAreaInsets().bottom;
  } catch {
    return 20;
  }
}

export { bucketFor, relTime, CHAT_BUCKET_LABELS } from "./chatBuckets";
export type { ChatBucket } from "./chatBuckets";
const sh = StyleSheet.create({
  container: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "82%",
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  grabber: { alignItems: "center", paddingVertical: 6 },
  grabberBar: { width: 38, height: 5, borderRadius: 3, opacity: 0.5 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  title: { fontSize: 17, fontWeight: "700" },
});

const pk = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  list: { maxHeight: 420 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 15, fontWeight: "500", flexShrink: 1 },
  defTag: { fontSize: 10, opacity: 0.7 },
  caps: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  srcBadge: {
    fontSize: 9,
    fontWeight: "700",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: "hidden",
  },
  empty: { textAlign: "center", paddingVertical: 20, fontSize: 13 },
});

export function InputCard({ widget }: { widget: InputWidget }) {
  const mode = useThemeMode();
  const t = theme(mode);
  return (
    <View
      style={[
        tl.inputCard,
        { borderColor: t.border, backgroundColor: t.surface },
      ]}
    >
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Ionicons
          name="help-circle-outline"
          size={14}
          color={t.accent}
          style={{ marginTop: 2 }}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: t.text, fontSize: 14, fontWeight: "600" }}>
            {widget.title}
          </Text>
          {widget.description ? (
            <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 2 }}>
              {widget.description}
            </Text>
          ) : null}
          {widget.fields.map((field) => {
            const value = widget.answers?.[field.id];
            const shown = value
              ? field.kind === "choice"
                ? (field.options.find((o) => o.value === value)?.label ?? value)
                : value
              : null;
            return (
              <View key={field.id} style={{ marginTop: 6 }}>
                <Text style={{ color: t.textMuted, fontSize: 11 }}>
                  {field.label ?? field.id}
                </Text>
                <Text
                  style={{
                    color: value ? t.text : t.textMuted,
                    fontSize: 12,
                    fontStyle: value ? undefined : "italic",
                  }}
                >
                  {value ? shown : "No answer"}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const tl = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 3,
  },
  list: { gap: 6, marginTop: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 8,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pulse: { opacity: 0.5 },
  server: {
    fontSize: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    paddingHorizontal: 4,
    overflow: "hidden",
  },
  inputCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
    marginBottom: 6,
  },
});

const tk = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
  },
  big: { fontSize: 20, fontWeight: "700", marginBottom: 6 },
  note: { fontSize: 13, lineHeight: 19, marginBottom: 8 },
  btn: {
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 4,
    flexDirection: "row",
    justifyContent: "center",
  },
});
