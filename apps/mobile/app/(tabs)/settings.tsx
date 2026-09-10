import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  sttModelName,
  sttModelSetting,
  THINKING_EFFORTS,
  useAppStore,
  useRpc,
  useSettings,
} from "@kotys/core";
import type {
  McpServerInfo,
  MemoryRecord,
  ModelListing,
  SkillListing,
} from "@kotys/contracts";
import { theme, useThemeMode } from "../../lib/theme";
import { palette } from "@kotys/ui-tokens";
import { clearConfig } from "../../lib/config";
import { PairingScreen } from "../../components/PairingScreen";
import { Sheet } from "../../components/kit";

type Section = "general" | "tools" | "mcp" | "skills" | "memory" | "voice";

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "general", label: "General", icon: "settings-outline" },
  { key: "tools", label: "Tools", icon: "construct-outline" },
  { key: "mcp", label: "MCP Servers", icon: "hardware-chip-outline" },
  { key: "skills", label: "Skills", icon: "flash-outline" },
  { key: "memory", label: "Memory", icon: "headset-outline" },
  { key: "voice", label: "Voice", icon: "mic-outline" },
];

export default function SettingsScreen() {
  const mode = useThemeMode();
  const t = theme(mode);
  const rpc = useRpc();
  const [section, setSection] = useState<Section>("general");
  const [unpaired, setUnpaired] = useState(false);

  const handleUnpaired = useCallback(() => {
    setUnpaired(true);
  }, []);

  if (unpaired) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <PairingScreen onPaired={() => setUnpaired(false)} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.sectionBar}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}
      >
        {SECTIONS.map((sec) => {
          const active = section === sec.key;
          return (
            <Pressable
              key={sec.key}
              onPress={() => setSection(sec.key)}
              style={[
                s.sectionChip,
                {
                  borderColor: active ? t.accent : t.border,
                  backgroundColor: active ? t.accent : t.surface,
                },
              ]}
            >
              <Ionicons
                name={sec.icon as never}
                size={13}
                color={active ? "#fff" : t.textMuted}
              />
              <Text
                style={{
                  color: active ? "#fff" : t.text,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                {sec.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {section === "general" ? (
        <General themed={t} onUnpaired={handleUnpaired} />
      ) : null}
      {section === "tools" ? <Tools themed={t} rpc={rpc} /> : null}
      {section === "mcp" ? <Mcp themed={t} rpc={rpc} /> : null}
      {section === "skills" ? <Skills themed={t} rpc={rpc} /> : null}
      {section === "memory" ? <Memory themed={t} rpc={rpc} /> : null}
      {section === "voice" ? <Voice themed={t} rpc={rpc} /> : null}
    </View>
  );
}

type Themed = ReturnType<typeof theme>;

function General({
  themed,
  onUnpaired,
}: {
  themed: Themed;
  onUnpaired: () => void;
}) {
  const t = themed;
  const { apiKeyPresent, setApiKey, hydrated } = useSettings();
  const themePref = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const thinkingEffort = useAppStore((s) => s.thinkingEffort);
  const setThinkingEffort = useAppStore((s) => s.setThinkingEffort);
  const defaultModel = useAppStore((s) => s.defaultModel);
  const [keyDraft, setKeyDraft] = useState("");

  const unpair = () => {
    Alert.alert(
      "Unpair from Mac",
      "You will need the URL and token to pair again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unpair",
          style: "destructive",
          onPress: () => {
            void clearConfig().then(onUnpaired);
          },
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }}>
      <View
        style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}
      >
        <Text style={[s.cardTitle, { color: t.text }]}>API key</Text>
        <TextInput
          value={keyDraft}
          onChangeText={setKeyDraft}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={
            apiKeyPresent ? "(stored — type to replace)" : "ollama_…"
          }
          placeholderTextColor={t.textMuted}
          style={[
            s.input,
            { color: t.text, borderColor: t.border, backgroundColor: t.bg },
          ]}
        />
        <Text style={{ color: t.textMuted, fontSize: 12 }}>
          Needed for cloud models (ollama.com). Stored on your Mac, never sent
          back.
        </Text>
        {keyDraft ? (
          <Pressable
            onPress={() => {
              void setApiKey(keyDraft);
              setKeyDraft("");
            }}
            style={[s.primaryBtn, { backgroundColor: t.accent }]}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
              Save key
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View
        style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}
      >
        <Text style={[s.cardTitle, { color: t.text }]}>Appearance</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["system", "light", "dark"] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => void setTheme(m)}
              style={[
                s.chip,
                {
                  borderColor: themePref === m ? t.accent : t.border,
                  backgroundColor: themePref === m ? t.accent : "transparent",
                  flex: 1,
                  alignItems: "center",
                },
              ]}
            >
              <Ionicons
                name={
                  m === "system"
                    ? "phone-portrait-outline"
                    : m === "light"
                      ? "sunny-outline"
                      : "moon-outline"
                }
                size={14}
                color={themePref === m ? "#fff" : t.textMuted}
              />
              <Text
                style={{
                  color: themePref === m ? "#fff" : t.text,
                  fontSize: 12,
                  fontWeight: "600",
                  textTransform: "capitalize",
                }}
              >
                {m}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={[s.cardTitle, { color: t.text, marginTop: 8 }]}>
          Thinking effort
        </Text>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {THINKING_EFFORTS.map((e) => (
            <Pressable
              key={e}
              onPress={() => void setThinkingEffort(e)}
              style={[
                s.chip,
                {
                  borderColor: thinkingEffort === e ? t.accent : t.border,
                  backgroundColor:
                    thinkingEffort === e ? t.accent : "transparent",
                },
              ]}
            >
              <Text
                style={{
                  color: thinkingEffort === e ? "#fff" : t.text,
                  fontSize: 12,
                  fontWeight: "600",
                  textTransform: "capitalize",
                }}
              >
                {e}
              </Text>
            </Pressable>
          ))}
        </View>
        {hydrated ? (
          <Text style={{ color: t.textMuted, fontSize: 12 }}>
            Default model: {defaultModel.name}
          </Text>
        ) : null}
      </View>

      <View
        style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}
      >
        <Text style={[s.cardTitle, { color: t.text }]}>Paired to this Mac</Text>
        <Text style={{ color: t.textMuted, fontSize: 13 }}>
          The agent runs on your Mac — chats, files and tools stay there.
        </Text>
        <Pressable
          onPress={unpair}
          style={[s.dangerBtn, { borderColor: t.danger }]}
        >
          <Text style={{ color: t.danger, fontWeight: "600", fontSize: 14 }}>
            Unpair
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Voice({
  themed,
  rpc,
}: {
  themed: Themed;
  rpc: ReturnType<typeof useRpc>;
}) {
  const t = themed;
  const sttModel = useAppStore((s) => s.sttModel);
  const setSttModel = useAppStore((s) => s.setSttModel);
  const [models, setModels] = useState<ModelListing[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void rpc.stt
      .models()
      .then((list) => {
        if (!cancelled) setModels(list as ModelListing[]);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [rpc]);

  const selectedName = sttModelName(sttModel);

  const pick = (name: string | null) => {
    setPickerOpen(false);
    if (!name) {
      void setSttModel(null);
      return;
    }
    const listing = models.find((m) => m.name === name);
    void setSttModel(sttModelSetting(listing?.provider ?? "omlx", name));
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }}>
      <View
        style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}
      >
        <Text style={[s.cardTitle, { color: t.text }]}>
          Transcription model
        </Text>
        <Text style={{ color: t.textMuted, fontSize: 12 }}>
          Hold the mic in the chat to dictate. Speech is transcribed on your
          Mac.
        </Text>
        {loadError ? (
          <Text style={{ color: t.danger, fontSize: 12 }}>{loadError}</Text>
        ) : models.length === 0 ? (
          <Text style={{ color: t.textMuted, fontSize: 12 }}>
            No speech-to-text models available. Enable oMLX in the desktop app.
          </Text>
        ) : (
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={[s.input, { borderColor: t.border, backgroundColor: t.bg }]}
          >
            <Text
              style={{
                color: selectedName ? t.text : t.textMuted,
                fontSize: 14,
              }}
            >
              {selectedName ?? "None"}
            </Text>
          </Pressable>
        )}
      </View>
      <Sheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Transcription model"
      >
        <FlatList
          data={[{ name: null as string | null }, ...models]}
          keyExtractor={(m) => m.name ?? "none"}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => pick(item.name)}
              style={[
                s.rowCard,
                { backgroundColor: t.surface, borderColor: t.border },
              ]}
            >
              <Text
                style={{
                  color:
                    (item.name ?? null) === selectedName ? t.accent : t.text,
                  fontWeight:
                    (item.name ?? null) === selectedName ? "700" : "400",
                  fontSize: 14,
                  flex: 1,
                }}
              >
                {item.name ?? "None"}
              </Text>
            </Pressable>
          )}
        />
      </Sheet>
    </ScrollView>
  );
}

type IoniconName = keyof typeof Ionicons.glyphMap;

/** Tool name → Ionicon, mirroring the desktop TOOL_ICONS (lucide) mapping. */
const TOOL_ICONS: Record<string, IoniconName> = {
  current_datetime: "time-outline",
  web_search: "search-outline",
  web_fetch: "globe-outline",
  read_file: "document-text-outline",
  list: "folder-open-outline",
  grep: "search-outline",
  write_file: "document-text-outline",
  apply_patch: "create-outline",
  bash: "terminal-outline",
  computer_observe: "camera-outline",
  list_chats: "chatbox-ellipses-outline",
  search_chats: "time-outline",
  get_chat: "chatbubble-ellipses-outline",
  request_user_input: "help-circle-outline",
  mcp_load_tools: "apps-outline",
  search_memories: "headset-outline",
  create_memory: "headset-outline",
  update_memory: "headset-outline",
  delete_memory: "trash-outline",
  create_todo: "add-circle-outline",
  update_todo: "list-outline",
  complete_todo: "checkbox-outline",
  list_todos: "list-outline",
  delete_todo: "trash-outline",
  start_pomodoro: "timer-outline",
};

function Tools({
  themed,
  rpc,
}: {
  themed: Themed;
  rpc: ReturnType<typeof useRpc>;
}) {
  const t = themed;
  const [tools, setTools] = useState<
    { name: string; description: string; category?: string }[]
  >([]);
  const [enabled, setEnabledMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      rpc.tools.list() as Promise<
        { name: string; description: string; category?: string }[]
      >,
      rpc.settings.get({ key: "tools_enabled" }) as Promise<{
        value: string | null;
      }>,
    ])
      .then(([list, raw]) => {
        setTools(list);
        try {
          setEnabledMap(
            raw.value ? (JSON.parse(raw.value) as Record<string, boolean>) : {},
          );
        } catch {
          setEnabledMap({});
        }
      })
      .finally(() => setLoading(false));
  }, [rpc]);

  const toggle = (name: string, next: boolean) => {
    const updated = { ...enabled, [name]: next };
    setEnabledMap(updated);
    void rpc.settings.set({
      key: "tools_enabled",
      value: JSON.stringify(updated),
    });
  };

  const enabledCount = tools.filter(
    (tool) => enabled[tool.name] !== false,
  ).length;

  if (loading) {
    return <Text style={s.loading}>Loading…</Text>;
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.count, { color: t.textMuted }]}>
        {enabledCount}/{tools.length} enabled · MCP tools are managed under MCP
        Servers
      </Text>
      <FlatList
        data={tools}
        keyExtractor={(tool) => tool.name}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 6 }}
        renderItem={({ item }) => {
          const on = enabled[item.name] !== false;
          return (
            <View
              style={[
                s.rowCard,
                {
                  backgroundColor: t.surface,
                  borderColor: t.border,
                  opacity: on ? 1 : 0.8,
                },
              ]}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <Ionicons
                  name={TOOL_ICONS[item.name] ?? "hammer-outline"}
                  size={15}
                  color={t.textMuted}
                  style={{ marginTop: 2 }}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Text
                      style={{ color: t.text, fontSize: 14, fontWeight: "600" }}
                    >
                      {item.name}
                    </Text>
                    {item.category ? (
                      <Text
                        style={[
                          s.catTag,
                          { color: t.textMuted, borderColor: t.border },
                        ]}
                      >
                        {item.category}
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    numberOfLines={2}
                    style={{ color: t.textMuted, fontSize: 11 }}
                  >
                    {item.description}
                  </Text>
                </View>
              </View>
              <Switch
                value={on}
                onValueChange={(v) => toggle(item.name, v)}
                trackColor={{ true: t.accent, false: t.border }}
                thumbColor="#fff"
              />
            </View>
          );
        }}
      />
    </View>
  );
}

function Skills({
  themed,
  rpc,
}: {
  themed: Themed;
  rpc: ReturnType<typeof useRpc>;
}) {
  const t = themed;
  const [skills, setSkills] = useState<SkillListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (rpc.skills.list() as Promise<SkillListing[]>)
      .then(setSkills)
      .finally(() => setLoading(false));
  }, [rpc]);

  const toggle = (name: string, next: boolean) => {
    setSkills((prev) =>
      prev.map((sk) => (sk.name === name ? { ...sk, enabled: next } : sk)),
    );
    void rpc.skills.setEnabled({ name, enabled: next });
  };

  const enabledCount = skills.filter((sk) => sk.enabled).length;

  if (loading) {
    return <Text style={s.loading}>Loading…</Text>;
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.count, { color: t.textMuted }]}>
        {enabledCount}/{skills.length} enabled · authored on the Mac in
        ~/.kotys/skills
      </Text>
      <FlatList
        data={skills}
        keyExtractor={(sk) => sk.name}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 6 }}
        renderItem={({ item }) => (
          <View
            style={[
              s.rowCard,
              { backgroundColor: t.surface, borderColor: t.border },
            ]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Text
                  style={{ color: t.text, fontSize: 14, fontWeight: "600" }}
                >
                  {item.name}
                </Text>
                <Text
                  style={[
                    s.catTag,
                    { color: t.textMuted, borderColor: t.border },
                  ]}
                >
                  {item.source}
                </Text>
              </View>
              <Text
                numberOfLines={2}
                style={{ color: t.textMuted, fontSize: 11 }}
              >
                {item.error ?? item.description}
              </Text>
            </View>
            <Switch
              value={item.enabled}
              onValueChange={(v) => toggle(item.name, v)}
              trackColor={{ true: t.accent, false: t.border }}
              thumbColor="#fff"
            />
          </View>
        )}
      />
    </View>
  );
}

function Mcp({
  themed,
  rpc,
}: {
  themed: Themed;
  rpc: ReturnType<typeof useRpc>;
}) {
  const t = themed;
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);

  const load = useCallback(() => {
    return rpc.mcp.servers() as Promise<McpServerInfo[]>;
  }, [rpc]);

  useEffect(() => {
    void load()
      .then(setServers)
      .finally(() => setLoading(false));
  }, [load]);

  const reconnect = () => {
    setReconnecting(true);
    void (rpc.mcp.reconnect() as Promise<McpServerInfo[]>)
      .then(setServers)
      .finally(() => setReconnecting(false));
  };

  if (loading) return <Text style={s.loading}>Loading…</Text>;

  const connected = servers.filter((s) => s.status === "connected").length;

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 8,
          gap: 8,
        }}
      >
        <Text
          style={[
            s.count,
            { color: t.textMuted, flex: 1, paddingHorizontal: 0 },
          ]}
        >
          {connected}/{servers.length} connected · configure servers in the
          desktop app
        </Text>
        <Pressable onPress={reconnect} disabled={reconnecting} hitSlop={6}>
          <Ionicons
            name="refresh"
            size={18}
            color={reconnecting ? t.textMuted : t.accent}
          />
        </Pressable>
      </View>
      <FlatList
        data={servers}
        keyExtractor={(s) => s.name}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 6 }}
        ListEmptyComponent={
          <Text
            style={{
              color: t.textMuted,
              textAlign: "center",
              paddingVertical: 24,
              fontSize: 13,
            }}
          >
            No MCP servers configured.
          </Text>
        }
        renderItem={({ item }) => {
          const color =
            item.status === "connected"
              ? t.ok
              : item.status === "error"
                ? t.danger
                : t.textMuted;
          return (
            <View
              style={[
                s.rowCard,
                { backgroundColor: t.surface, borderColor: t.border },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: color,
                    }}
                  />
                  <Text
                    style={{ color: t.text, fontSize: 14, fontWeight: "600" }}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={{
                      color,
                      fontSize: 11,
                      fontWeight: "700",
                      textTransform: "uppercase",
                    }}
                  >
                    {item.status}
                  </Text>
                </View>
                {item.error ? (
                  <Text
                    numberOfLines={2}
                    style={{ color: t.danger, fontSize: 11 }}
                  >
                    {item.error}
                  </Text>
                ) : (
                  <Text style={{ color: t.textMuted, fontSize: 11 }}>
                    {item.tools?.length ?? 0} tools
                  </Text>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const TYPE_STYLES: Record<string, string> = {
  user: palette.dark.accent,
  preference: "#8b5cf6",
  project: "#10b981",
  fact: "#f59e0b",
};

function Memory({
  themed,
  rpc,
}: {
  themed: Themed;
  rpc: ReturnType<typeof useRpc>;
}) {
  const t = themed;
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{
    id: number;
    content: string;
  } | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const load = useCallback(() => {
    return rpc.memories.list({}) as Promise<MemoryRecord[]>;
  }, [rpc]);

  useEffect(() => {
    void load()
      .then(setMemories)
      .catch(() => setMemories([]))
      .finally(() => setLoading(false));
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return memories;
    return memories.filter(
      (m) =>
        m.content.toLowerCase().includes(q) ||
        m.key.toLowerCase().includes(q) ||
        m.topics.join(" ").toLowerCase().includes(q),
    );
  }, [memories, query]);

  if (loading) return <Text style={s.loading}>Loading…</Text>;

  return (
    <View style={{ flex: 1 }}>
      <View
        style={[
          s.search,
          {
            marginHorizontal: 16,
            marginTop: 8,
            borderColor: t.border,
            backgroundColor: t.surface,
          },
        ]}
      >
        <Ionicons name="search" size={14} color={t.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Filter memories…"
          placeholderTextColor={t.textMuted}
          style={{ flex: 1, color: t.text, fontSize: 14 }}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 6 }}
        ListEmptyComponent={
          <Text
            style={{
              color: t.textMuted,
              textAlign: "center",
              paddingVertical: 24,
              fontSize: 13,
            }}
          >
            The model writes memories here on its own —{"\n"}user and preference
            types are always in context.
          </Text>
        }
        renderItem={({ item }) => {
          const typeColor = TYPE_STYLES[item.type] ?? t.textMuted;
          const isEditing = editing?.id === item.id;
          const isConfirming = confirmingId === item.id;
          return (
            <View
              style={[
                s.rowCard,
                { backgroundColor: t.surface, borderColor: t.border },
              ]}
            >
              {isEditing ? (
                <>
                  <TextInput
                    value={editing.content}
                    onChangeText={(v) =>
                      setEditing({ id: item.id, content: v })
                    }
                    multiline
                    style={[
                      s.input,
                      {
                        color: t.text,
                        borderColor: t.accent,
                        backgroundColor: t.bg,
                      },
                    ]}
                  />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable
                      onPress={() => setEditing(null)}
                      style={[s.chip, { borderColor: t.border }]}
                    >
                      <Text style={{ color: t.text, fontSize: 12 }}>
                        Cancel
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        void rpc.memories
                          .update({ id: item.id, content: editing.content })
                          .then(() => load())
                          .then((rows) => setMemories(rows as MemoryRecord[]))
                          .finally(() => setEditing(null));
                      }}
                      style={[
                        s.chip,
                        { borderColor: t.accent, backgroundColor: t.accent },
                      ]}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: "600",
                        }}
                      >
                        Save
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={{ color: t.text, fontSize: 14 }}>
                    {item.content}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 6,
                      alignItems: "center",
                      marginTop: 4,
                      flexWrap: "wrap",
                    }}
                  >
                    <Text
                      style={[
                        s.catTag,
                        { color: typeColor, borderColor: typeColor },
                      ]}
                    >
                      {item.type}
                    </Text>
                    {item.topics.slice(0, 3).map((topic) => (
                      <Text
                        key={topic}
                        style={{ color: t.textMuted, fontSize: 10 }}
                      >
                        #{topic}
                      </Text>
                    ))}
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 12,
                      marginTop: 6,
                      alignItems: "center",
                    }}
                  >
                    <Pressable
                      onPress={() =>
                        setEditing({ id: item.id, content: item.content })
                      }
                      hitSlop={6}
                    >
                      <Ionicons
                        name="create-outline"
                        size={16}
                        color={t.textMuted}
                      />
                    </Pressable>
                    {isConfirming ? (
                      <>
                        <Pressable
                          onPress={() => setConfirmingId(null)}
                          hitSlop={6}
                        >
                          <Ionicons
                            name="close"
                            size={16}
                            color={t.textMuted}
                          />
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            void rpc.memories
                              .remove({ id: item.id })
                              .then(() =>
                                setMemories((prev) =>
                                  prev.filter((m) => m.id !== item.id),
                                ),
                              )
                              .finally(() => setConfirmingId(null));
                          }}
                          hitSlop={6}
                        >
                          <Text
                            style={{
                              color: t.danger,
                              fontWeight: "700",
                              fontSize: 12,
                            }}
                          >
                            Delete
                          </Text>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable
                        onPress={() => setConfirmingId(item.id)}
                        hitSlop={6}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={16}
                          color={t.textMuted}
                        />
                      </Pressable>
                    )}
                  </View>
                </>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  sectionBar: { flexGrow: 0, paddingVertical: 8 },
  sectionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  primaryBtn: {
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 11,
  },
  dangerBtn: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
  },
  catTag: {
    fontSize: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: "hidden",
    textTransform: "uppercase",
    fontWeight: "600",
  },
  count: { fontSize: 12, paddingHorizontal: 16, paddingTop: 10 },
  loading: { textAlign: "center", color: "#9ca3af", marginTop: 40 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
});
