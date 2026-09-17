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
import type {
  ListRenderItemInfo,
  NativeScrollEvent,
  NativeSyntheticEvent,
  TextInputSelectionChangeEvent,
} from "react-native";
import { Bubble } from "../../components/chat/Bubble";
import { QueuedMessageRow } from "../../components/chat/QueuedMessageRow";
import { ON_ACCENT, s, themedStyles } from "../../components/chat/styles";
import { TurnSeparator } from "../../components/chat/TurnSeparator";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  DEFAULT_MODEL,
  findSlashQuery,
  insertSlashCommand,
  isInputForChat,
  queueCaption,
  SkillMessage,
  useAppStore,
  useChat,
  useChatList,
  usePlatform,
  useSkills,
  useTokenEstimator,
  useUserInputStore,
  useVoiceInput,
} from "@kotys/core";
import type { Message, VoiceStatus } from "@kotys/core";
import type { ModelListing, SkillListing } from "@kotys/contracts";
import { registerScrollHandler } from "../../lib/platform";
import { useChatScreen } from "../../lib/useChatScreen";
import { pickImages, takePhoto, MAX_IMAGES } from "../../lib/images";
import { theme, useThemeMode } from "../../lib/theme";
import { UserInputInline } from "../../components/UserInputInline";
import { SlashMenu } from "../../components/chat/SlashMenu";
import {
  ModelPickers,
  ModePicker,
  ThinkingPicker,
  TokenBadge,
} from "../../components/kit";

type ChatRouteParams = { id: string };

const RENAME_CHAT = "Rename chat";
const PHOTO_LIBRARY = "Photo library";
const TAKE_PHOTO = "Take photo";
const CANCEL = "Cancel";
const CHAT_ACTIONS = [RENAME_CHAT, CANCEL];
const ATTACH_ACTIONS = [PHOTO_LIBRARY, TAKE_PHOTO, CANCEL];
const KEYBOARD_GAP = 8;
const AT_BOTTOM_THRESHOLD = 64;

const keyExtractor = (m: Message) => String(m.id);

const bottomInset = (
  kbHeight: number,
  safeBottom: number,
  minBottom: number,
) => ({
  paddingBottom:
    kbHeight > 0 ? kbHeight + KEYBOARD_GAP : Math.max(safeBottom, minBottom),
});

const reportSend = (pending: Promise<{ needsSettings: boolean }>) => {
  pending
    .then((res) => {
      if (!res.needsSettings) return;
      Alert.alert(
        "API key required",
        "The selected model runs in the cloud and needs an API key. Set it in Settings → API key.",
      );
    })
    .catch((err: unknown) => {
      Alert.alert(
        "Could not send",
        err instanceof Error ? err.message : String(err),
      );
    });
};

const composerPlaceholder = (status: VoiceStatus, seconds: number) => {
  if (status === "recording") {
    return `Listening… ${seconds}s — release to transcribe`;
  }
  if (status === "transcribing") return "Transcribing…";
  return "Message — runs on your Mac";
};

const micLabel = (status: VoiceStatus, seconds: number) => {
  if (status === "recording") {
    return `Listening — ${seconds} seconds. Release to transcribe`;
  }
  if (status === "transcribing") return "Transcribing";
  return "Hold to dictate";
};

function ChatScreen() {
  const { id } = useLocalSearchParams<ChatRouteParams>();
  const chatId = id ? Number(id) : null;
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const mode = useThemeMode();
  const t = theme(mode);
  const ts = themedStyles[mode];

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
  const chatTitle = chat?.title ?? "";
  const chatSummary = chat?.summary ?? null;
  const chatSummaryUpto = chat?.summary_upto ?? null;
  const isCompacted = Boolean(chatSummary);

  const { setActiveChatId, bumpChatsVersion } = useAppStore();
  const thinkingEffort = useAppStore((state) => state.thinkingEffort);
  const permissionMode = useAppStore((state) => state.permissionMode);

  const listRef = useRef<FlatList<Message>>(null);

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
  } = useChatScreen();

  const composerInset = bottomInset(kbHeight, insets.bottom, 8);
  const panelInset = bottomInset(kbHeight, insets.bottom, 12);

  useEffect(() => {
    if (chatId !== null) setActiveChatId(chatId);
  }, [chatId, setActiveChatId]);

  useEffect(() => {
    if (chatId === null || !chatsLoaded) return;
    if (chats.some((c) => c.id === chatId)) return;
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    router.replace("/");
  }, [chatId, chatsLoaded, chats, navigation, router]);

  const chatModel = chat?.llmModel ?? DEFAULT_MODEL;
  const inputRequest = useUserInputStore((state) => state.pending);
  const inputPending = isInputForChat(inputRequest, chatId);
  const supportsThinking = chatModel.capabilities.includes("thinking");
  const visionCapable = chatModel.capabilities.includes("vision");
  const platform = usePlatform();
  const { skills } = useSkills();
  const [cursor, setCursor] = useState<number | null>(null);

  const slashQuery = useMemo(
    () => (cursor === null ? null : findSlashQuery(draft, cursor)),
    [draft, cursor],
  );

  const slashKey = slashQuery ? `${slashQuery.from}:${slashQuery.query}` : null;
  const [slashDismissed, setSlashDismissed] = useState<string | null>(null);
  const hasText = draft.trim() !== "";
  const canSubmit = hasText || pendingImages.length > 0;

  const handleChatCreated = useCallback(
    (newId: number) => {
      setActiveChatId(newId);
      bumpChatsVersion();
    },
    [setActiveChatId, bumpChatsVersion],
  );

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
    steer,
  } = useChat({
    activeChatId: chatId,
    chatSummary,
    chatSummaryUpto,
    chatModel,
    chatTitle,
    chatTopics: chat?.topics ?? [],
    onChatCreated: handleChatCreated,
    onTitleInferred: bumpChatsVersion,
    onTopicsInferred: bumpChatsVersion,
  });

  const promptRename = useCallback(() => {
    Alert.prompt(
      RENAME_CHAT,
      undefined,
      (text) => {
        const title = (text ?? "").trim();
        if (!title || chatId === null) return;
        void renameChat(chatId, title);
        bumpChatsVersion();
      },
      "plain-text",
      chatTitle,
    );
  }, [chatId, chatTitle, renameChat, bumpChatsVersion]);

  const handleOpenChatActions = useCallback(() => {
    if (Platform.OS !== "ios") return;
    ActionSheetIOS.showActionSheetWithOptions(
      { options: CHAT_ACTIONS, cancelButtonIndex: CHAT_ACTIONS.length - 1 },
      (idx) => {
        if (CHAT_ACTIONS[idx] === RENAME_CHAT) promptRename();
      },
    );
  }, [promptRename]);

  const handleCompact = useCallback(() => {
    void compactNow();
  }, [compactNow]);

  const headerBadge = useTokenEstimator(messages, chatModel.contextLength, {
    summary: chatSummary,
    summaryUpto: chatSummaryUpto,
  });
  const headerPct = contextUsed > 0 ? headerBadge.pct : 0;
  // setOptions re-renders the screen; without this signature gate it loops.
  const headerSignature = `${chatTitle}|${headerPct}|${headerBadge.ctx}|${chatModel.name}|${isCompacted}|${isCompacting}|${mode}`;
  const prevHeaderSignature = useRef<string | null>(null);

  useEffect(() => {
    if (prevHeaderSignature.current === headerSignature) return;
    prevHeaderSignature.current = headerSignature;
    navigation.setOptions({
      title: chatTitle || "Chat",
      headerRight: () => (
        <View style={s.headerActions}>
          <TokenBadge
            used={contextUsed}
            pct={headerBadge.pct}
            ctx={headerBadge.ctx}
            compacted={isCompacted}
            isCompacting={isCompacting}
            onCompact={handleCompact}
          />
          <Pressable
            onPress={handleOpenChatActions}
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
    chatTitle,
    contextUsed,
    headerBadge.pct,
    headerBadge.ctx,
    isCompacted,
    isCompacting,
    handleCompact,
    handleOpenChatActions,
    t.text,
  ]);

  const messagesRef = useRef<Message[]>(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    registerScrollHandler((messageId) => {
      const index = messagesRef.current.findIndex((m) => m.id === messageId);
      if (index < 0) return;
      listRef.current?.scrollToIndex({ index, viewPosition: 0.5 });
    });
    return () => registerScrollHandler(null);
  }, []);

  const lastMessageId =
    messages.length > 0 ? messages[messages.length - 1].id : 0;

  useEffect(() => {
    if (!atBottom || !lastMessageId) return;
    listRef.current?.scrollToEnd({ animated: true });
  }, [lastMessageId, atBottom]);

  const handleAttach = useCallback(
    (source: "library" | "camera") => {
      const remaining = MAX_IMAGES - pendingImages.length;
      if (remaining <= 0) return;
      const run = source === "camera" ? takePhoto() : pickImages(remaining);
      run.then(addPendingImages).catch(() => undefined);
    },
    [pendingImages.length, addPendingImages],
  );

  const handleAttachPress = useCallback(() => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ATTACH_ACTIONS,
        cancelButtonIndex: ATTACH_ACTIONS.length - 1,
      },
      (idx) => {
        if (ATTACH_ACTIONS[idx] === PHOTO_LIBRARY) handleAttach("library");
        if (ATTACH_ACTIONS[idx] === TAKE_PHOTO) handleAttach("camera");
      },
    );
  }, [handleAttach]);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    const text = draft.trim();
    const images = visionCapable ? pendingImages : [];
    setSlashDismissed(null);
    clearDraft();
    pinBottom();
    reportSend(send(text, images));
    requestAnimationFrame(() =>
      listRef.current?.scrollToEnd({ animated: true }),
    );
  }, [
    canSubmit,
    draft,
    pendingImages,
    visionCapable,
    send,
    clearDraft,
    pinBottom,
  ]);

  const handlePick = useCallback(
    (skill: SkillListing) => {
      if (!slashQuery) return;
      const picked = insertSlashCommand(draft, slashQuery, skill.name);
      setDraft(picked.text);
      setCursor(picked.cursor);
      setSlashDismissed(`${slashQuery.from}:${skill.name}`);
    },
    [draft, slashQuery, setDraft],
  );

  const handleDismiss = useCallback(() => {
    setSlashDismissed(slashKey);
  }, [slashKey]);

  const handleSelectionChange = useCallback(
    ({ nativeEvent: { selection } }: TextInputSelectionChangeEvent) => {
      setCursor(selection.start === selection.end ? selection.end : null);
    },
    [],
  );

  const handleTranscript = useCallback(
    (text: string) => {
      pinBottom();
      reportSend(send(text, []));
    },
    [send, pinBottom],
  );

  const {
    status: voiceStatus,
    error: voiceError,
    start: startVoice,
    stop: stopVoice,
    cancel: cancelVoice,
  } = useVoiceInput(platform, handleTranscript);
  const isRecording = voiceStatus === "recording";
  const isTranscribing = voiceStatus === "transcribing";
  const [voiceSeconds, setVoiceSeconds] = useState(0);

  useEffect(() => {
    if (!isRecording) return;
    const started = Date.now();
    const timer = setInterval(
      () => setVoiceSeconds(Math.floor((Date.now() - started) / 1000)),
      500,
    );
    return () => clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    if (voiceStatus !== "error" || !voiceError) return;
    Alert.alert("Voice input failed", voiceError);
  }, [voiceStatus, voiceError]);

  const handleMicPressIn = useCallback(() => {
    setVoiceSeconds(0);
    void startVoice();
  }, [startVoice]);

  const handleMicPressOut = useCallback(() => {
    if (isRecording) {
      stopVoice();
      return;
    }
    cancelVoice();
  }, [isRecording, stopVoice, cancelVoice]);

  const handleCommitEdit = useCallback(() => {
    if (!editing) return;
    const text = editing.text.trim();
    const target = editing.id;
    setEditing(null);
    if (!text) return;
    void editAndResend(target, text).catch(() => undefined);
  }, [editing, editAndResend, setEditing]);

  const handleCancelEdit = useCallback(() => {
    setEditing(null);
  }, [setEditing]);

  const handleEditTextChange = useCallback(
    (text: string) => {
      if (!editing) return;
      setEditing({ id: editing.id, text });
    },
    [editing, setEditing],
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const bottom = layoutMeasurement.height + contentOffset.y;
      const paddingToEnd = contentSize.height - bottom;
      atBottomRef.current = paddingToEnd < AT_BOTTOM_THRESHOLD;
      setAtBottom(atBottomRef.current);
    },
    [atBottomRef, setAtBottom],
  );

  // `regenerate` is rebuilt on every streamed flush; the ref keeps
  // handleRegenerate stable so memoized Bubbles skip re-rendering.
  const regenerateRef = useRef(regenerate);

  useEffect(() => {
    regenerateRef.current = regenerate;
  }, [regenerate]);

  const handleRegenerate = useCallback((mid: number) => {
    void regenerateRef.current(mid).catch(() => undefined);
  }, []);

  const handleEdit = useCallback(
    (m: Message) =>
      setEditing({ id: m.id, text: SkillMessage.typedText(m.content) }),
    [setEditing],
  );

  // Deferred: called synchronously it races the uncommitted layout and no-ops.
  const handleContentSizeChange = useCallback(() => {
    if (!atBottomRef.current) return;
    requestAnimationFrame(() =>
      listRef.current?.scrollToEnd({ animated: false }),
    );
  }, [atBottomRef]);

  const handleJumpToLatest = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const handleOpenModelSheet = useCallback(() => {
    setModelSheet(true);
  }, [setModelSheet]);

  const handleCloseModelSheet = useCallback(() => {
    setModelSheet(false);
  }, [setModelSheet]);

  const handleOpenThinkSheet = useCallback(() => {
    setThinkSheet(true);
  }, [setThinkSheet]);

  const handleCloseThinkSheet = useCallback(() => {
    setThinkSheet(false);
  }, [setThinkSheet]);

  const handleOpenModeSheet = useCallback(() => {
    setModeSheet(true);
  }, [setModeSheet]);

  const handleCloseModeSheet = useCallback(() => {
    setModeSheet(false);
  }, [setModeSheet]);

  const handleSelectModel = useCallback(
    async (m: ModelListing) => {
      if (chatId === null) return;
      await selectModelForActiveChat(m);
    },
    [chatId, selectModelForActiveChat],
  );

  const pendingThumbs = useMemo(() => {
    const copies = new Map<string, number>();
    return pendingImages.map((uri) => {
      const tail = uri.slice(-16);
      const copy = copies.get(tail) ?? 0;
      copies.set(tail, copy + 1);
      return { key: `${tail}-${copy}`, source: { uri } };
    });
  }, [pendingImages]);

  const emptyComponent = useMemo(
    () => (
      <View style={s.empty}>
        <Ionicons name="sparkles-outline" size={36} color={t.textMuted} />
        <Text style={[s.emptyText, ts.mutedText]}>
          Ask anything — the model runs on your Mac{"\n"}and can use its tools.
        </Text>
      </View>
    ),
    [t.textMuted, ts.mutedText],
  );

  const renderBubble = useCallback(
    ({ item }: ListRenderItemInfo<Message>) => (
      <Bubble
        message={item}
        isStreaming={streamingId === item.id}
        isHighlighted={highlightId === item.id}
        isBusy={isLoading}
        onRegenerate={handleRegenerate}
        onEdit={handleEdit}
      />
    ),
    [streamingId, highlightId, isLoading, handleRegenerate, handleEdit],
  );

  return (
    <View style={[s.screen, ts.screen]}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={keyExtractor}
        renderItem={renderBubble}
        ItemSeparatorComponent={TurnSeparator}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        onContentSizeChange={handleContentSizeChange}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={emptyComponent}
        contentContainerStyle={s.listContent}
      />

      {!atBottom ? (
        <Pressable
          onPress={handleJumpToLatest}
          style={[s.jump, ts.jump]}
          accessibilityLabel="Jump to latest"
        >
          <Ionicons name="arrow-down" size={16} color={t.text} />
        </Pressable>
      ) : null}

      {editing ? (
        <View style={[s.editBar, ts.editBar, panelInset]}>
          <Text style={[s.editHint, ts.mutedText]}>
            Editing your message — history after it will be resent
          </Text>
          <TextInput
            value={editing.text}
            onChangeText={handleEditTextChange}
            multiline
            // eslint-disable-next-line jsx-a11y/no-autofocus -- user-opened edit bar; focusing it is the point
            autoFocus
            keyboardAppearance={mode}
            style={[s.editInput, ts.text]}
          />
          <View style={s.editActions}>
            <Pressable
              onPress={handleCancelEdit}
              style={[s.editBtn, ts.editCancel]}
            >
              <Text style={[s.editBtnText, ts.text]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleCommitEdit}
              style={[s.editBtn, ts.editResend]}
            >
              <Text style={s.resendText}>Resend</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[s.composerWrap, composerInset]}>
          {queuedMessages.length > 0 ? (
            <View style={s.queue} accessibilityLiveRegion="polite">
              <Text style={[s.queueCaption, ts.mutedText]}>
                {queueCaption(streamingId !== null, queuedMessages.length)}
              </Text>
              {queuedMessages.map((queued) => (
                <QueuedMessageRow
                  key={queued.id}
                  message={queued}
                  streamingId={streamingId}
                  onDequeue={dequeue}
                  onSteer={steer}
                />
              ))}
            </View>
          ) : null}
          {pendingThumbs.length > 0 ? (
            <View style={s.pendingRow} accessibilityLiveRegion="polite">
              {pendingThumbs.map((thumb, index) => (
                <View key={thumb.key} style={s.pendingThumbWrap}>
                  <Image source={thumb.source} style={s.pendingThumb} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove image"
                    onPress={() => removePendingImage(index)}
                    style={[s.pendingRemove, ts.pendingRemove]}
                    hitSlop={4}
                  >
                    <Ionicons name="close" size={10} color={t.text} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          {slashQuery && slashKey !== slashDismissed && !inputPending ? (
            <SlashMenu
              skills={skills}
              query={slashQuery.query}
              onPick={handlePick}
              onDismiss={handleDismiss}
            />
          ) : null}
          <View style={[s.composer, ts.composer]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSelectionChange={handleSelectionChange}
              placeholder={composerPlaceholder(voiceStatus, voiceSeconds)}
              placeholderTextColor={isRecording ? t.danger : t.textMuted}
              pointerEvents={isRecording ? "none" : "auto"}
              multiline
              keyboardAppearance={mode}
              style={[s.composerInput, ts.text]}
            />
            {isLoading ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Queue message"
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                  hitSlop={6}
                  style={[s.send, canSubmit ? ts.sendRaised : s.sendIdle]}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={18}
                    color={hasText ? t.text : t.textMuted}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Stop generating"
                  onPress={abort}
                  hitSlop={6}
                  style={[s.send, ts.sendRaised]}
                >
                  <Ionicons name="stop" size={18} color={t.danger} />
                </Pressable>
              </>
            ) : inputPending ? (
              <View style={[s.inputWrap, panelInset]}>
                <UserInputInline />
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                onPress={handleSubmit}
                disabled={!canSubmit}
                hitSlop={6}
                style={[s.send, canSubmit ? ts.sendActive : ts.sendRaised]}
              >
                <Ionicons
                  name="arrow-up"
                  size={18}
                  color={hasText ? ON_ACCENT : t.textMuted}
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
                  onPress={handleAttachPress}
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
                accessibilityLabel={micLabel(voiceStatus, voiceSeconds)}
                disabled={isTranscribing}
                onPressIn={handleMicPressIn}
                onPressOut={handleMicPressOut}
                hitSlop={6}
                style={s.toolBtn}
              >
                <Ionicons
                  name={isTranscribing ? "hourglass-outline" : "mic-outline"}
                  size={19}
                  color={isRecording || isTranscribing ? t.accent : t.textMuted}
                />
              </Pressable>
              <View style={s.spacer} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Model ${chatModel.name}. Change model`}
                onPress={handleOpenModelSheet}
                hitSlop={6}
                style={[s.toolChip, ts.toolChip]}
              >
                <Text numberOfLines={1} style={[s.modelChipText, ts.mutedText]}>
                  {chatModel.name}
                </Text>
              </Pressable>
              {supportsThinking ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Thinking effort ${thinkingEffort}. Change`}
                  onPress={handleOpenThinkSheet}
                  hitSlop={6}
                  style={[s.toolChip, ts.toolChip]}
                >
                  <Ionicons
                    name="sparkles-outline"
                    size={12}
                    color={t.textMuted}
                  />
                  <Text style={[s.chipText, ts.mutedText]}>
                    {thinkingEffort}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Permission mode ${permissionMode}. Change`}
                onPress={handleOpenModeSheet}
                hitSlop={6}
                style={[s.toolChip, ts.toolChip]}
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
                <Text style={[s.chipText, ts.mutedText]}>{permissionMode}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      <ModelPickers
        visible={modelSheet}
        onClose={handleCloseModelSheet}
        chatModel={chatModel}
        onSelectModel={handleSelectModel}
      />
      <ThinkingPicker
        visible={thinkSheet}
        onClose={handleCloseThinkSheet}
        model={chatModel}
      />
      <ModePicker visible={modeSheet} onClose={handleCloseModeSheet} />
    </View>
  );
}

export default ChatScreen;
