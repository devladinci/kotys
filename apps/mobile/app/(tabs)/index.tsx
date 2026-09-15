import { useCallback, useMemo, useRef, useState, memo, useSyncExternalStore } from "react";
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useAppStore,
  useChatList,
  useNow,
  getRpc,
  clearExpiredGenerating,
  isGenerating,
  subscribeGenerating,
} from "@kotys/core";
import type { Chat } from "@kotys/core";
import { theme, useThemeMode } from "../../lib/theme";
import {
  bucketFor,
  CHAT_BUCKET_LABELS,
  relTime,
  type ChatBucket,
} from "../../components/kit";

/** Date labels and Today/Yesterday headers tick on this clock. */
const DATE_TICK_MS = 60_000;

type Row =
  | { kind: "header"; key: string; label: string }
  | { kind: "chat"; key: string; chat: Chat }
  | {
      kind: "hit";
      key: string;
      chatId: number;
      title: string;
      snippet: string;
      role: string;
    };

// Rows rebuild only on chats/pins/search churn — the 60s clock lives in RelTime.
const HeaderRow = memo(function HeaderRow({ label }: { label: string }) {
  const mode = useThemeMode();
  const t = theme(mode);
  return (
    <Text style={[s.header, { color: t.textMuted }]}>
      {label.toUpperCase()}
    </Text>
  );
});

const HitRow = memo(function HitRow({
  item,
  onPress,
}: {
  item: Extract<Row, { kind: "hit" }>;
  onPress: (chatId: number) => void;
}) {
  const mode = useThemeMode();
  const t = theme(mode);
  return (
    <Pressable
      onPress={() => onPress(item.chatId)}
      style={({ pressed }) => [
        s.row,
        { backgroundColor: pressed ? t.surface2 : "transparent" },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{ color: t.text, fontSize: 14, fontWeight: "600" }}
        >
          {item.role === "user" ? "You: " : ""}
          {item.title}
        </Text>
        <Text numberOfLines={2} style={{ color: t.textMuted, fontSize: 12 }}>
          {item.snippet}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={t.textMuted} />
    </Pressable>
  );
});

// Rows rebuild only on chats/pins/search churn — the clock is passed down
// from one screen-level tick, so a tick never invalidates row identities.
const RelTime = memo(function RelTime({
  ts,
  now,
}: {
  ts: number;
  now: number;
}) {
  const mode = useThemeMode();
  const t = theme(mode);
  return (
    <Text style={{ color: t.textMuted, fontSize: 11 }}>{relTime(ts, now)}</Text>
  );
});

const ChatRow = memo(function ChatRow({
  chat,
  pinned,
  now,
  onOpen,
  onActions,
}: {
  chat: Chat;
  pinned: boolean;
  now: number;
  onOpen: (id: number) => void;
  onActions: (chat: Chat) => void;
}) {
  const mode = useThemeMode();
  const t = theme(mode);
  const generating = useSyncExternalStore(
    subscribeGenerating,
    () => isGenerating(chat.id),
    () => isGenerating(chat.id),
  );
  return (
    <Pressable
      onPress={() => onOpen(chat.id)}
      onLongPress={() => onActions(chat)}
      delayLongPress={300}
      style={({ pressed }) => [
        s.row,
        { backgroundColor: pressed ? t.surface2 : "transparent" },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {pinned ? <Ionicons name="pin" size={12} color={t.accent} /> : null}
          <Text
            numberOfLines={1}
            style={{
              color: t.text,
              fontSize: 15,
              fontWeight: "500",
              flexShrink: 1,
            }}
          >
            {chat.title || "New chat"}
          </Text>
          {generating ? (
            <Ionicons
              name="sparkles"
              size={12}
              color={t.accent}
              accessibilityLabel="Generating"
            />
          ) : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {chat.topics.length > 0 ? (
            <Text
              numberOfLines={1}
              style={{ color: t.textMuted, fontSize: 12, flexShrink: 1 }}
            >
              {chat.topics.join(" · ")}
            </Text>
          ) : null}
          <RelTime ts={chat.updated_at} now={now} />
        </View>
      </View>
      <Pressable
        accessibilityLabel={`Options for ${chat.title}`}
        onPress={() => onActions(chat)}
        hitSlop={12}
        style={s.more}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={t.textMuted} />
      </Pressable>
    </Pressable>
  );
});

export default function ChatListScreen() {
  const mode = useThemeMode();
  const t = theme(mode);
  const router = useRouter();
  const now = useNow(DATE_TICK_MS);
  // The 60s clock doubles as the generating-registry sweeper: heartbeats keep
  // entries alive, a stalled stream ages out at the next sweep.
  clearExpiredGenerating();
  const { chats, loadChats, deleteChat, renameChat } = useChatList();
  const { setActiveChatId, bumpChatsVersion, pinnedChatIds, togglePinned } =
    useAppStore();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<
    | {
        id: number;
        chat_id: number;
        title: string;
        snippet: string;
        role: string;
      }[]
    | null
  >(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback(
    (id: number) => {
      setActiveChatId(id);
      router.push(`/chat/${id}`);
    },
    [router, setActiveChatId],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadChats();
    } finally {
      setRefreshing(false);
    }
  }, [loadChats]);

  const onSearchChange = useCallback((q: string) => {
    setSearch(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const query = q.trim();
    if (!query) {
      setHits(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void getRpc()
        .messages.search({ query })
        .then((rows) => setHits(rows))
        .catch(() => setHits([]));
    }, 250);
  }, []);

  const promptRename = useCallback(
    (chat: Chat) => {
      const prompt = (
        Alert as unknown as {
          prompt?: (
            title: string,
            message: string | undefined,
            cb: (text: string) => void,
            type: string,
            defaultValue: string,
          ) => void;
        }
      ).prompt;
      if (!prompt) return;
      prompt(
        "Rename chat",
        undefined,
        (text) => {
          const title = (text ?? "").trim();
          if (!title) return;
          void renameChat(chat.id, title).then(() => bumpChatsVersion());
        },
        "plain-text",
        chat.title ?? "",
      );
    },
    [renameChat, bumpChatsVersion],
  );

  const confirmDelete = useCallback(
    (chat: Chat) => {
      Alert.alert(
        "Delete chat",
        `“${chat.title || "New chat"}” will be removed.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () =>
              void deleteChat(chat.id).then(() => bumpChatsVersion()),
          },
        ],
      );
    },
    [deleteChat, bumpChatsVersion],
  );

  const chatActions = useCallback(
    (chat: Chat) => {
      void ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            pinnedChatIds.has(chat.id) ? "Unpin" : "Pin",
            "Rename",
            "Delete",
            "Cancel",
          ],
          cancelButtonIndex: 3,
          destructiveButtonIndex: 2,
        },
        (idx) => {
          if (idx === 0) void togglePinned(chat.id);
          if (idx === 1) promptRename(chat);
          if (idx === 2) confirmDelete(chat);
        },
      );
    },
    [pinnedChatIds, togglePinned, promptRename, confirmDelete],
  );

  const keyExtractor = useCallback((r: Row) => r.key, []);
  const rows = useMemo<Row[]>(() => {
    if (hits !== null) {
      if (hits.length === 0) return [];
      return hits.map((h) => ({
        kind: "hit" as const,
        key: `hit-${h.id}`,
        chatId: h.chat_id,
        title: h.title || "New chat",
        snippet: h.snippet,
        role: h.role,
      }));
    }
    const pinned = chats.filter((c) => pinnedChatIds.has(c.id));
    const rest = chats
      .filter((c) => !pinnedChatIds.has(c.id))
      .sort((a, b) => b.updated_at - a.updated_at);
    const groups = new Map<Exclude<ChatBucket, "pinned">, Chat[]>();
    for (const c of rest) {
      const b = bucketFor(c.updated_at, now);
      const list = groups.get(b) ?? [];
      list.push(c);
      groups.set(b, list);
    }
    const out: Row[] = [];
    if (pinned.length > 0) {
      out.push({
        kind: "header",
        key: "h-pinned",
        label: CHAT_BUCKET_LABELS.pinned,
      });
      for (const c of pinned)
        out.push({ kind: "chat", key: `c-${c.id}`, chat: c });
    }
    for (const b of [
      "today",
      "yesterday",
      "week",
      "month",
      "earlier",
    ] as const) {
      const list = groups.get(b);
      if (!list) continue;
      out.push({ kind: "header", key: `h-${b}`, label: CHAT_BUCKET_LABELS[b] });
      for (const c of list)
        out.push({ kind: "chat", key: `c-${c.id}`, chat: c });
    }
    return out;
  }, [chats, pinnedChatIds, hits, now]);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === "header") {
        return <HeaderRow label={item.label} />;
      }
      if (item.kind === "hit") {
        return <HitRow item={item} onPress={open} />;
      }
      return (
        <ChatRow
          chat={item.chat}
          pinned={pinnedChatIds.has(item.chat.id)}
          now={now}
          onOpen={open}
          onActions={chatActions}
        />
      );
    },
    [open, chatActions, pinnedChatIds, now],
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={[s.search, { backgroundColor: t.surface2 }]}>
        <Ionicons name="search" size={15} color={t.textMuted} />
        <TextInput
          value={search}
          onChangeText={onSearchChange}
          placeholder="Search"
          placeholderTextColor={t.textMuted}
          style={{ flex: 1, color: t.text, fontSize: 15 }}
          autoCorrect={false}
        />
        {search ? (
          <Pressable onPress={() => onSearchChange("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={t.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {hits !== null && hits.length === 0 ? (
        <Text style={s.noHits}>Nothing matches “{search.trim()}”</Text>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={t.textMuted}
          />
        }
        ListEmptyComponent={
          hits === null ? (
            <View style={s.empty}>
              <Ionicons
                name="chatbubbles-outline"
                size={40}
                color={t.textMuted}
              />
              <Text
                style={{
                  color: t.textMuted,
                  textAlign: "center",
                  marginTop: 12,
                }}
              >
                No chats yet. Tap ＋ to start one —{"\n"}it runs on your Mac.
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ padding: 12, gap: 6, flexGrow: 1 }}
      />
    </View>
  );
}
const s = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
  },
  noHits: {
    textAlign: "center",
    color: "#9ca3af",
    marginTop: 24,
    fontSize: 13,
  },
  header: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  more: { paddingHorizontal: 6, paddingVertical: 6 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 4,
  },
});
