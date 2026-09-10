import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Bubble, keyExtractor } from "../../components/chat/Bubble";
import { s } from "../../components/chat/styles";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  DEFAULT_MODEL,
  parseSlashQuery,
  useAppStore,
  useChat,
  useChatList,
  usePlatform,
  useSkills,
  useTokenEstimator,
  useUserInputStore,
  useVoiceInput,
} from "@kotys/core";
import type { Message } from "@kotys/core";
import type { SkillListing } from "@kotys/contracts";
import { registerScrollHandler } from "../../lib/platform";
import { useChatScreen } from "./useChatScreen";
import { pickImages, takePhoto, MAX_IMAGES } from "../../lib/images";
import { theme, useThemeMode } from "../../lib/theme";
import { UserInputInline } from "../../components/UserInputInline";
import SlashMenu from "../../components/chat/SlashMenu";
import {
  ModelPickers,
  ModePicker,
  ThinkingPicker,
  TokenBadge,
} from "../../components/kit";

function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = id ? Number(id) : null;
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const mode = useThemeMode();
  const t = theme(mode);
  const {
    chats,
    loaded: chatsLoaded,
    selectModelForActiveChat,
    renameChat,
  } = useChatList();
  const chat = useMemo(
    () => chats.find((c) => c.id === chatId) ?? null,
    [chats, chatId],
  );
  const { setActiveChatId, bumpChatsVersion } = useAppStore();
  const thinkingEffort = useAppStore((s) => s.thinkingEffort);
  const permissionMode = useAppStore((s) => s.permissionMode);

  const listRef = useRef<FlatList<Message>>(null);
  const screen = useChatScreen();
  const {
    draft,
    setDraft,
    atBottom,
    setAtBottom,
    atBottomRef,
    kbHeight,
    modelSheet,
    setModelSheet,
    thinkSheet,
    setThinkSheet,
    modeSheet,
    setModeSheet,
    editing,
    setEditing,
    pendingImages,
    pinBottom,
    addPendingImages,
    removePendingImage,
    clearDraft,
  } = screen;

  useEffect(() => {
    if (chatId !== null) setActiveChatId(chatId);
  }, [chatId, setActiveChatId]);

  // The chat under this screen vanished (deleted here or from another
  // client) — leave instead of rendering a dead chat against a stale id.
  useEffect(() => {
    if (chatId !== null && chatsLoaded && !chats.some((c) => c.id === chatId)) {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        router.replace("/");
      }
    }
  }, [chatId, chatsLoaded, chats, navigation, router]);

  const chatModel = chat?.llmModel ?? DEFAULT_MODEL;
  const inputPending = useUserInputStore((s) => s.pending);
  const supportsThinking = chatModel.capabilities.includes("thinking");
  const visionCapable = chatModel.capabilities.includes("vision");
  const platform = usePlatform();
  const { skills } = useSkills();
  const slashQuery = useMemo(() => parseSlashQuery(draft), [draft]);
  const [slashDismissed, setSlashDismissed] = useState(false);

  const {
    messages,
    isLoading,
    streamingId,
    highlightId,
    send,
    abort,
    contextUsed,
    compactNow,
    isCompacting,
    regenerate,
    editAndResend,
    queuedMessages,
    dequeue,
  } = useChat({
    activeChatId: chatId,
    chatSummary: chat?.summary ?? null,
    chatSummaryUpto: chat?.summary_upto ?? null,
    chatModel,
    chatTitle: chat?.title ?? "",
    chatTopics: chat?.topics ?? [],
    onChatCreated: (newId) => {
      setActiveChatId(newId);
      bumpChatsVersion();
    },
    onTitleInferred: () => bumpChatsVersion(),
    onTopicsInferred: () => bumpChatsVersion(),
  });

  const promptRename = useCallback(() => {
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
        if (title && chatId !== null) {
          void renameChat(chatId, title);
          bumpChatsVersion();
        }
      },
      "plain-text",
      chat?.title ?? "",
    );
  }, [chatId, chat?.title, renameChat, bumpChatsVersion]);

  const openChatActions = useCallback(() => {
    if (Platform.OS === "ios") {
      // The per-chat controls (model / thinking / permission) live as tappable
      // chips in the composer toolbar below the input — one tap each. The
      // header "…" only carries the rarely-used rename action.
      void ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Rename chat", "Cancel"], cancelButtonIndex: 1 },
        (idx) => {
          if (idx === 0) promptRename();
        },
      );
    }
  }, [promptRename]);

  // nav bar title + actions; keyed on the rounded context percent so
  // streaming chunks don't re-dispatch setOptions (which re-renders the
  // screen — an unkeyed effect here was an infinite loop).
  const headerBadge = useTokenEstimator(messages, chatModel.contextLength, {
    summary: chat?.summary ?? null,
    summaryUpto: chat?.summary_upto ?? null,
  });
  const headerPct = contextUsed > 0 ? headerBadge.pct : 0;
  const headerSignature = `${chat?.title ?? ""}|${headerPct}|${headerBadge.ctx}|${chatModel.name}|${!!chat?.summary}|${isCompacting}|${mode}`;
  const prevHeaderSignature = useRef<string | null>(null);
  useEffect(() => {
    if (prevHeaderSignature.current === headerSignature) return;
    prevHeaderSignature.current = headerSignature;
    navigation.setOptions({
      title: chat?.title || "Chat",
      headerRight: () => (
        <View
          style={{
            flexDirection: "row",
            gap: 14,
            alignItems: "center",
            // 44pt-class touch band, vertically centered in the header.
            paddingVertical: 10,
            paddingRight: 4,
          }}
        >
          <TokenBadge
            used={contextUsed}
            pct={headerBadge.pct}
            ctx={headerBadge.ctx}
            compacted={!!chat?.summary}
            isCompacting={isCompacting}
            onCompact={() => void compactNow()}
          />
          <Pressable
            onPress={openChatActions}
            hitSlop={12}
            accessibilityLabel="Chat options"
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={t.text} />
          </Pressable>
        </View>
      ),
    });
  }, [
    headerSignature,
    navigation,
    chat,
    chatModel,
    contextUsed,
    headerBadge.pct,
    headerBadge.ctx,
    isCompacting,
    compactNow,
    openChatActions,
    t.text,
    thinkingEffort,
    permissionMode,
  ]);

  // Platform seam: registration happens once per mount; messages are read
  // through a ref so the handler never goes stale.
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    registerScrollHandler((messageId) => {
      const index = messagesRef.current.findIndex((m) => m.id === messageId);
      if (index >= 0)
        listRef.current?.scrollToIndex({ index, viewPosition: 0.5 });
    });
    return () => registerScrollHandler(null);
  }, []);

  const lastMessageId =
    messages.length > 0 ? messages[messages.length - 1].id : 0;
  useEffect(() => {
    if (atBottom && lastMessageId) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [lastMessageId, atBottom]);

  const handleAttach = useCallback(
    (mode: "library" | "camera") => {
      const remaining = MAX_IMAGES - pendingImages.length;
      if (remaining <= 0) return;
      const run = mode === "camera" ? takePhoto() : pickImages(remaining);
      run.then(addPendingImages).catch(() => undefined);
    },
    [pendingImages.length, addPendingImages],
  );

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text && pendingImages.length === 0) return;
    // Same guard as the web Composer: a non-vision model silently ignores
    // attachments instead of erroring at the daemon.
    const images = visionCapable ? pendingImages : [];
    setSlashDismissed(false);
    clearDraft();
    // A send is an explicit "show me the latest" signal — re-pin even if the
    // user had scrolled up (ChatGPT/iMessage behavior).
    pinBottom();
    // Keep the keyboard open — closing it after every message is the
    // classic chat-app annoyance (iMessage/WhatsApp/ChatGPT all keep it).
    send(text, images)
      .then((res) => {
        if (res.needsSettings) {
          Alert.alert(
            "API key required",
            "The selected model runs in the cloud and needs an API key. Set it in Settings → API key.",
          );
        }
      })
      .catch((err: unknown) => {
        Alert.alert(
          "Could not send",
          err instanceof Error ? err.message : String(err),
        );
      });
    requestAnimationFrame(() =>
      listRef.current?.scrollToEnd({ animated: true }),
    );
  }, [
    draft,
    pendingImages,
    visionCapable,
    send,
    clearDraft,
    pinBottom,
    setSlashDismissed,
  ]);

  const handlePick = useCallback(
    (skill: SkillListing) => {
      const parsed = parseSlashQuery(draft);
      const tail = parsed && parsed.args ? ` ${parsed.args}` : "";
      setDraft(`/${skill.name}${tail} `);
      setSlashDismissed(true);
    },
    [draft, setDraft],
  );

  const handleDismiss = useCallback(() => {
    setSlashDismissed(true);
    setDraft("");
  }, [setDraft]);

  const sendVoiceTranscript = useCallback(
    (text: string) => {
      // Auto-send path: same needsSettings / error handling as submit, so a
      // voice message never vanishes silently. Re-pin like submit does.
      pinBottom();
      send(text, [])
        .then((res) => {
          if (res.needsSettings) {
            Alert.alert(
              "API key required",
              "The selected model runs in the cloud and needs an API key. Set it in Settings → API key.",
            );
          }
        })
        .catch((err: unknown) => {
          Alert.alert(
            "Could not send",
            err instanceof Error ? err.message : String(err),
          );
        });
    },
    [send, pinBottom],
  );

  const voice = useVoiceInput(platform, sendVoiceTranscript);

  // Elapsed seconds while recording — mirrors the web MicButton's counter so
  // a held press visibly shows it's live even before any text appears.
  const recording = voice.status === "recording";
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const timer = setInterval(
      () => setVoiceSeconds(Math.floor((Date.now() - started) / 1000)),
      500,
    );
    return () => clearInterval(timer);
  }, [recording]);

  // Voice failures (denied mic, transcription error) reach the user the
  // same way a failed send does.
  const voiceStatus = voice.status;
  const voiceErrorText = voice.error;
  useEffect(() => {
    if (voiceStatus !== "error" || !voiceErrorText) return;
    Alert.alert("Voice input failed", voiceErrorText);
  }, [voiceStatus, voiceErrorText]);

  const commitEdit = useCallback(() => {
    if (!editing) return;
    const text = editing.text.trim();
    const target = editing.id;
    setEditing(null);
    if (!text) return;
    void editAndResend(target, text).catch(() => undefined);
  }, [editing, editAndResend, setEditing]);

  const handleScroll = useCallback(
    (e: {
      nativeEvent: {
        layoutMeasurement: { height: number };
        contentOffset: { y: number };
        contentSize: { height: number };
      };
    }) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const bottom = layoutMeasurement.height + contentOffset.y;
      const paddingToEnd = contentSize.height - bottom;
      atBottomRef.current = paddingToEnd < 64;
      setAtBottom(atBottomRef.current);
    },
    [atBottomRef, setAtBottom],
  );

  // `regenerate` changes identity on every streamed flush (it reads
  // `messages`, so it's rebuilt per chunk). Funneling it through a ref keeps
  // handleRegenerate stable so the memoized Bubble only re-renders for its own
  // message changes — otherwise renderBubble churns and every visible bubble
  // re-parses markdown at flush cadence, which starves the JS thread and makes
  // typing in the composer lag.
  const regenerateRef = useRef(regenerate);
  useEffect(() => {
    regenerateRef.current = regenerate;
  }, [regenerate]);
  const handleRegenerate = useCallback((mid: number) => {
    void regenerateRef.current(mid).catch(() => undefined);
  }, []);
  const handleEdit = useCallback(
    (m: Message) => setEditing({ id: m.id, text: m.content }),
    [setEditing],
  );

  // Stable so ChatScreen's per-keystroke renders bail out of the
  // VirtualizedList pass (it shallow-compares props) instead of re-laying
  // out the virtualized tree on every keypress.
  // scrollToEnd must be deferred: called synchronously inside
  // onContentSizeChange it races the not-yet-committed layout and silently
  // no-ops, leaving the stream's tail below the fold.
  const handleContentSizeChange = useCallback(() => {
    if (atBottomRef.current)
      requestAnimationFrame(() =>
        listRef.current?.scrollToEnd({ animated: false }),
      );
  }, [atBottomRef]);
  const emptyComponent = useMemo(
    () => (
      <View style={s.empty}>
        <Ionicons name="sparkles-outline" size={36} color={t.textMuted} />
        <Text
          style={{ color: t.textMuted, textAlign: "center", marginTop: 10 }}
        >
          Ask anything — the model runs on your Mac{"\n"}and can use its tools.
        </Text>
      </View>
    ),
    [t.textMuted],
  );
  const listContentStyle = useMemo(
    () =>
      ({
        padding: 12,
        // Spacing between messages comes from the role-aware separator, not a
        // uniform gap: tight within a turn, wider before a new user message.
        flexGrow: 1,
        justifyContent: "flex-end",
      }) as const,
    [],
  );
  // Turn rhythm (the ChatGPT/iMessage pattern): consecutive messages inside a
  // turn sit tight; a new user message opens a visibly larger gap. Runs as a
  // separator so the memoized Bubble never re-renders for spacing changes.
  const turnSeparator = useCallback(
    ({ trailingItem }: { leadingItem?: Message; trailingItem?: Message }) => (
      <View style={{ height: trailingItem?.role === "user" ? 16 : 4 }} />
    ),
    [],
  );
  const renderBubble = useMemo(
    () =>
      ({ item }: { item: Message }) => (
        <Bubble
          message={item}
          streaming={streamingId === item.id}
          highlighted={highlightId === item.id}
          busy={isLoading}
          onRegenerate={handleRegenerate}
          onEdit={handleEdit}
        />
      ),
    [streamingId, highlightId, isLoading, handleRegenerate, handleEdit],
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={keyExtractor}
        renderItem={renderBubble}
        ItemSeparatorComponent={turnSeparator}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        onContentSizeChange={handleContentSizeChange}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={emptyComponent}
        contentContainerStyle={listContentStyle}
      />

      {!atBottom ? (
        <Pressable
          onPress={() => listRef.current?.scrollToEnd({ animated: true })}
          style={[
            s.jump,
            { backgroundColor: t.surface, borderColor: t.border },
          ]}
          accessibilityLabel="Jump to latest"
        >
          <Ionicons name="arrow-down" size={16} color={t.text} />
        </Pressable>
      ) : null}

      {editing ? (
        <View
          style={[
            s.editBar,
            {
              backgroundColor: t.surface,
              borderTopColor: t.border,
              // Same bottom rule as the composer: keyboard frame (+ daylight),
              // else home inset.
              paddingBottom:
                kbHeight > 0 ? kbHeight + 8 : Math.max(insets.bottom, 12),
            },
          ]}
        >
          <Text style={{ color: t.textMuted, fontSize: 12 }}>
            Editing your message — history after it will be resent
          </Text>
          <TextInput
            value={editing.text}
            onChangeText={(text) => setEditing({ id: editing.id, text })}
            multiline
            // User-triggered transient bar: focusing it is the point, not
            // page-load focus-stealing (which jsx-a11y/no-autofocus targets).
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            keyboardAppearance={mode === "dark" ? "dark" : "light"}
            style={{
              color: t.text,
              fontSize: 15,
              maxHeight: 90,
              paddingVertical: 6,
            }}
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => setEditing(null)}
              style={[s.editBtn, { borderColor: t.border }]}
            >
              <Text style={{ color: t.text, fontSize: 13 }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={commitEdit}
              style={[
                s.editBtn,
                { borderColor: t.accent, backgroundColor: t.accent },
              ]}
            >
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
                Resend
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View
          style={[
            s.composerWrap,
            {
              // Keyboard height + a little daylight above it; closed = home inset.
              paddingBottom:
                kbHeight > 0 ? kbHeight + 8 : Math.max(insets.bottom, 8),
            },
          ]}
        >
          {queuedMessages.length > 0 ? (
            <View
              style={{ paddingHorizontal: 10, gap: 4 }}
              accessibilityLiveRegion="polite"
            >
              <Text style={{ color: t.textMuted, fontSize: 11 }}>
                {queuedMessages.length} queued — sends when the reply finishes
              </Text>
              {queuedMessages.map((q) => (
                <View
                  key={q.id}
                  style={[
                    s.queueRow,
                    { backgroundColor: t.surface2, borderColor: t.border },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={{ color: t.textMuted, fontSize: 12, flex: 1 }}
                  >
                    {q.text || "(images)"}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove queued message"
                    onPress={() => dequeue(q.id)}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={14} color={t.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          {pendingImages.length > 0 ? (
            <View style={s.pendingRow} accessibilityLiveRegion="polite">
              {pendingImages.map((uri, i) => (
                <View key={`${i}-${uri.slice(-16)}`} style={s.pendingThumbWrap}>
                  <Image source={{ uri }} style={s.pendingThumb} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove image"
                    onPress={() => removePendingImage(i)}
                    style={[s.pendingRemove, { backgroundColor: t.surface }]}
                    hitSlop={4}
                  >
                    <Ionicons name="close" size={10} color={t.text} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          {slashQuery && !slashDismissed && !inputPending ? (
            <SlashMenu
              skills={skills}
              query={slashQuery.query}
              onPick={handlePick}
              onDismiss={handleDismiss}
            />
          ) : null}
          <View
            style={[
              s.composer,
              { backgroundColor: t.surface, borderColor: t.border },
            ]}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={
                voice.status === "recording"
                  ? `Listening… ${voiceSeconds}s — release to transcribe`
                  : voice.status === "transcribing"
                    ? "Transcribing…"
                    : "Message — runs on your Mac"
              }
              placeholderTextColor={
                voice.status === "recording" ? t.danger : t.textMuted
              }
              pointerEvents={voice.status === "recording" ? "none" : "auto"}
              multiline
              keyboardAppearance={mode === "dark" ? "dark" : "light"}
              style={{
                flex: 1,
                color: t.text,
                maxHeight: 120,
                fontSize: 15,
                paddingTop: 8,
                paddingBottom: 8,
                paddingLeft: 4,
              }}
            />
            {isLoading ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Queue message"
                  onPress={submit}
                  disabled={!draft.trim() && pendingImages.length === 0}
                  hitSlop={6}
                  style={[
                    s.send,
                    {
                      backgroundColor:
                        draft.trim() || pendingImages.length > 0
                          ? t.surface2
                          : "transparent",
                    },
                  ]}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={18}
                    color={draft.trim() ? t.text : t.textMuted}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Stop generating"
                  onPress={abort}
                  hitSlop={6}
                  style={[s.send, { backgroundColor: t.surface2 }]}
                >
                  <Ionicons name="stop" size={18} color={t.danger} />
                </Pressable>
              </>
            ) : inputPending ? (
              <View
                style={[
                  s.inputWrap,
                  {
                    // Same bottom rule as the composer: keyboard frame (+ daylight),
                    // else home inset.
                    paddingBottom:
                      kbHeight > 0 ? kbHeight + 8 : Math.max(insets.bottom, 12),
                  },
                ]}
              >
                <UserInputInline />
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                onPress={submit}
                disabled={!draft.trim() && pendingImages.length === 0}
                hitSlop={6}
                style={[
                  s.send,
                  {
                    backgroundColor:
                      draft.trim() || pendingImages.length > 0
                        ? t.accent
                        : t.surface2,
                  },
                ]}
              >
                <Ionicons
                  name="arrow-up"
                  size={18}
                  color={draft.trim() ? "#fff" : t.textMuted}
                />
              </Pressable>
            )}
          </View>
          {inputPending ? null : (
            <View style={s.composerTools}>
              {visionCapable ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Attach images"
                  onPress={() =>
                    ActionSheetIOS.showActionSheetWithOptions(
                      {
                        options: ["Photo library", "Take photo", "Cancel"],
                        cancelButtonIndex: 2,
                      },
                      (idx) => {
                        if (idx === 0) handleAttach("library");
                        if (idx === 1) handleAttach("camera");
                      },
                    )
                  }
                  hitSlop={6}
                  style={s.toolBtn}
                >
                  <Ionicons
                    name="image-outline"
                    size={19}
                    color={pendingImages.length > 0 ? t.accent : t.textMuted}
                  />
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  voice.status === "recording"
                    ? `Listening — ${voiceSeconds} seconds. Release to transcribe`
                    : voice.status === "transcribing"
                      ? "Transcribing"
                      : "Hold to dictate"
                }
                disabled={voice.status === "transcribing"}
                onPressIn={() => {
                  setVoiceSeconds(0);
                  void voice.start();
                }}
                onPressOut={() =>
                  voice.status === "recording" ? voice.stop() : voice.cancel()
                }
                hitSlop={6}
                style={s.toolBtn}
              >
                <Ionicons
                  name={
                    voice.status === "transcribing"
                      ? "hourglass-outline"
                      : "mic-outline"
                  }
                  size={19}
                  color={
                    recording || voice.status === "transcribing"
                      ? t.accent
                      : t.textMuted
                  }
                />
              </Pressable>
              <View style={{ flex: 1 }} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Model ${chatModel.name}. Change model`}
                onPress={() => setModelSheet(true)}
                hitSlop={6}
                style={[
                  s.toolChip,
                  { backgroundColor: t.surface2, borderColor: t.border },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={{ color: t.textMuted, fontSize: 12, maxWidth: 110 }}
                >
                  {chatModel.name}
                </Text>
              </Pressable>
              {supportsThinking ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Thinking effort ${thinkingEffort}. Change`}
                  onPress={() => setThinkSheet(true)}
                  hitSlop={6}
                  style={[
                    s.toolChip,
                    { backgroundColor: t.surface2, borderColor: t.border },
                  ]}
                >
                  <Ionicons
                    name="sparkles-outline"
                    size={12}
                    color={t.textMuted}
                  />
                  <Text style={{ color: t.textMuted, fontSize: 12 }}>
                    {thinkingEffort}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Permission mode ${permissionMode}. Change`}
                onPress={() => setModeSheet(true)}
                hitSlop={6}
                style={[
                  s.toolChip,
                  { backgroundColor: t.surface2, borderColor: t.border },
                ]}
              >
                <Ionicons
                  name={
                    permissionMode === "autopilot"
                      ? "rocket-outline"
                      : "hand-left-outline"
                  }
                  size={12}
                  color={t.textMuted}
                />
                <Text style={{ color: t.textMuted, fontSize: 12 }}>
                  {permissionMode}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      <ModelPickers
        visible={modelSheet}
        onClose={() => setModelSheet(false)}
        chatModel={chatModel}
        onSelectModel={async (m) => {
          if (chatId !== null) await selectModelForActiveChat(m);
        }}
      />
      <ThinkingPicker
        visible={thinkSheet}
        onClose={() => setThinkSheet(false)}
        model={chatModel}
      />
      <ModePicker visible={modeSheet} onClose={() => setModeSheet(false)} />
    </View>
  );
}

export default ChatScreen;
