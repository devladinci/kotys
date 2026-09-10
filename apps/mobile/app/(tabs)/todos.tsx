import { useCallback, useEffect, useMemo, useState, memo } from "react";
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  usePomodoroStore,
  useTodoStore,
  pastDateError,
  validateNewTodoDates,
  validateTodoDateChanges,
} from "@kotys/core";
import {
  asEpochSeconds,
  type CreateTodoInput,
  type TodoPriority,
  type TodoRecord,
} from "@kotys/contracts";
import { fromLocalInput, toLocalInput } from "../../lib/todoDates";
import { theme, useThemeMode } from "../../lib/theme";
import { dueLabelFor, GROUP_ORDER, GROUP_LABELS, groupFor } from "@kotys/core";

export default function TodosScreen() {
  const mode = useThemeMode();
  const t = theme(mode);
  const {
    todos,
    filter,
    setFilter,
    createTodo,
    updateTodo,
    toggleStatus,
    deleteTodo,
    undoDelete,
    pendingDelete,
    error,
    setError,
    chatAboutTodo,
  } = useTodoStore();
  // Subscribe to the action only — the whole-store subscription re-renders the
  // screen (and the FlatList below) on every pomodoro:tick.
  const pomodoroStart = usePomodoroStore((st) => st.start);
  const [draft, setDraft] = useState("");
  const [formTodo, setFormTodo] = useState<TodoRecord | "new" | null>(null);

  const submitDraft = useCallback(() => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    void createTodo({ title }).catch(() =>
      setError("Could not create the task."),
    );
  }, [draft, createTodo, setError]);

  const startPomodoroFor = useCallback(
    (todo: TodoRecord) => {
      void pomodoroStart({ task: todo.title, todo_id: todo.id });
    },
    [pomodoroStart],
  );

  const todoActions = useCallback(
    (todo: TodoRecord) => {
      void ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            "Edit",
            "Focus on this",
            "Chat about this",
            todo.status === "completed" ? "Reopen" : "Complete",
            "Delete",
            "Cancel",
          ],
          cancelButtonIndex: 5,
          destructiveButtonIndex: 4,
        },
        (idx) => {
          if (idx === 0) setFormTodo(todo);
          if (idx === 1) startPomodoroFor(todo);
          if (idx === 2) void chatAboutTodo(todo.id);
          if (idx === 3) void toggleStatus(todo.id);
          if (idx === 4)
            Alert.alert("Delete task", `“${todo.title}” will be removed.`, [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => void deleteTodo(todo.id),
              },
            ]);
        },
      );
    },
    [toggleStatus, deleteTodo, chatAboutTodo, startPomodoroFor],
  );

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, []);
  const groups = useMemo(() => {
    const map = new Map<string, TodoRecord[]>();
    for (const todo of todos) {
      if (
        filter.hasDueDate &&
        todo.due_at === null &&
        todo.status !== "completed"
      )
        continue;
      if (filter.status !== "all" && todo.status !== filter.status) continue;
      const g = groupFor(todo, now);
      const list = map.get(g) ?? [];
      list.push(todo);
      map.set(g, list);
    }
    return map;
  }, [todos, filter, now]);

  const visibleGroups = useMemo(
    () => GROUP_ORDER.filter((g) => (groups.get(g)?.length ?? 0) > 0),
    [groups],
  );

  const handleToggle = useCallback(
    (id: number) => void toggleStatus(id),
    [toggleStatus],
  );

  const renderGroup = useCallback(
    ({ item: g }: { item: (typeof GROUP_ORDER)[number] }) => {
      const list = groups.get(g) ?? [];
      const overdue = g === "overdue";
      return (
        <View>
          <View style={s.groupHeader}>
            {overdue ? (
              <Ionicons
                name="calendar-clear-outline"
                size={13}
                color={t.danger}
              />
            ) : null}
            <Text
              style={{
                color: overdue ? t.danger : t.textMuted,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              {GROUP_LABELS[g].toUpperCase()} · {list.length}
            </Text>
          </View>
          {list.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              now={now}
              themed={t}
              onToggle={handleToggle}
              onActions={todoActions}
            />
          ))}
        </View>
      );
    },
    [groups, t, now, handleToggle, todoActions],
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={s.filterRow}>
        {(["pending", "completed", "all"] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter({ status: f })}
            style={[
              s.filterChip,
              {
                borderColor: filter.status === f ? t.accent : t.border,
                backgroundColor: filter.status === f ? t.accent : "transparent",
              },
            ]}
          >
            <Text
              style={{
                color: filter.status === f ? "#fff" : t.textMuted,
                fontSize: 12,
                fontWeight: "600",
                textTransform: "capitalize",
              }}
            >
              {f}
            </Text>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => setFilter({ hasDueDate: !filter.hasDueDate })}
          accessibilityLabel="Only dated tasks"
          hitSlop={8}
        >
          <Ionicons
            name="calendar-outline"
            size={20}
            color={filter.hasDueDate ? t.accent : t.textMuted}
          />
        </Pressable>
      </View>

      {error ? (
        <Pressable
          onPress={() => setError(null)}
          style={[s.error, { backgroundColor: `${t.danger}22` }]}
        >
          <Text style={{ color: t.danger, fontSize: 13 }}>{error}</Text>
        </Pressable>
      ) : null}

      {pendingDelete ? (
        <View style={[s.undo, { backgroundColor: t.surface }]}>
          <Text
            numberOfLines={1}
            style={{ color: t.text, fontSize: 13, flex: 1 }}
          >
            Deleted “{pendingDelete.todo.title}”
          </Text>
          <Pressable
            onPress={() => void undoDelete()}
            hitSlop={8}
            accessibilityLabel="Undo delete"
          >
            <Text style={{ color: t.accent, fontWeight: "700", fontSize: 13 }}>
              Undo
            </Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={visibleGroups}
        keyExtractor={(g) => g}
        renderItem={renderGroup}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="list-outline" size={40} color={t.textMuted} />
            <Text
              style={{ color: t.textMuted, textAlign: "center", marginTop: 12 }}
            >
              No tasks here yet —{"\n"}add one below or ask the agent.
            </Text>
          </View>
        }
        contentContainerStyle={{
          padding: 12,
          paddingTop: 4,
          gap: 4,
          flexGrow: 1,
        }}
      />

      <View
        style={[
          s.composer,
          { backgroundColor: t.surface, borderColor: t.border },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submitDraft}
          returnKeyType="done"
          placeholder="Add a task…"
          placeholderTextColor={t.textMuted}
          style={{ flex: 1, color: t.text, fontSize: 15 }}
        />
        <Pressable
          accessibilityLabel="More options"
          onPress={() => setFormTodo("new")}
          hitSlop={8}
        >
          <Ionicons name="options-outline" size={20} color={t.textMuted} />
        </Pressable>
        <Pressable
          accessibilityLabel="Add task"
          onPress={submitDraft}
          disabled={!draft.trim()}
          hitSlop={8}
        >
          <Ionicons
            name="add-circle"
            size={26}
            color={draft.trim() ? t.accent : t.border}
          />
        </Pressable>
      </View>

      <TodoForm
        key={formTodo === "new" ? "new" : (formTodo?.id ?? "none")}
        mode={formTodo}
        themed={t}
        onClose={() => setFormTodo(null)}
        onCreate={(input) =>
          createTodo(input)
            .then(() => undefined)
            .catch(() => setError("Could not create the task."))
        }
        onUpdate={(id, fields) =>
          updateTodo(id, fields).catch(() =>
            setError("Could not update the task."),
          )
        }
        onFocus={(todo) => {
          setFormTodo(null);
          startPomodoroFor(todo);
        }}
      />
    </View>
  );
}

// Todo-scoped handlers keep this memo effective: the row re-renders only when
// its own record, the clock minute, or the theme changes.
const TodoRow = memo(function TodoRow({
  todo,
  now,
  themed,
  onToggle,
  onActions,
}: {
  todo: TodoRecord;
  now: number;
  themed: ReturnType<typeof theme>;
  onToggle: (id: number) => void;
  onActions: (todo: TodoRecord) => void;
}) {
  const t = themed;
  const done = todo.status === "completed";
  const due = todo.due_at !== null ? dueLabelFor(todo, now) : null;
  const overdue = due?.includes("overdue") ?? false;
  return (
    <Pressable
      onLongPress={() => onActions(todo)}
      delayLongPress={300}
      style={({ pressed }) => [
        s.todoRow,
        { backgroundColor: pressed ? t.surface2 : t.surface },
        overdue && !done ? { borderColor: t.danger } : null,
      ]}
    >
      <Pressable
        onPress={() => onToggle(todo.id)}
        accessibilityLabel={done ? "Mark pending" : "Mark completed"}
        hitSlop={10}
        style={s.check}
      >
        <Ionicons
          name={done ? "checkmark-circle" : "ellipse-outline"}
          size={22}
          color={done ? t.ok : t.textMuted}
        />
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={2}
          style={{
            color: t.text,
            fontSize: 15,
            textDecorationLine: done ? "line-through" : "none",
            opacity: done ? 0.55 : 1,
          }}
        >
          {todo.title}
        </Text>
        {todo.description ? (
          <Text numberOfLines={2} style={{ color: t.textMuted, fontSize: 12 }}>
            {todo.description}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {due ? (
            <Text
              style={{ color: overdue ? t.danger : t.textMuted, fontSize: 11 }}
            >
              {due}
            </Text>
          ) : null}
          {todo.notify_at !== null ? (
            <Ionicons
              name="notifications-outline"
              size={11}
              color={t.textMuted}
            />
          ) : null}
          {todo.priority !== "medium" ? (
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: todo.priority === "high" ? t.danger : t.ok,
                opacity: todo.priority === "high" ? 1 : 0.8,
              }}
            />
          ) : null}
          {todo.created_by === "agent" ? (
            <View style={[s.agentTag, { borderColor: t.border }]}>
              <Text
                style={{ color: t.textMuted, fontSize: 9, fontWeight: "700" }}
              >
                AI
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <Pressable
        accessibilityLabel={`Options for ${todo.title}`}
        onPress={() => onActions(todo)}
        hitSlop={12}
        style={s.more}
      >
        <Ionicons name="ellipsis-vertical" size={16} color={t.textMuted} />
      </Pressable>
    </Pressable>
  );
});

const PRIORITIES: TodoPriority[] = ["low", "medium", "high"];
const DUE_CHOICES = [
  { label: "None", days: null as number | null },
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "Next week", days: 7 },
];

/** Priority + due-date + reminder form for creating or editing a task. */
export function TodoForm({
  mode,
  themed,
  onClose,
  onCreate,
  onUpdate,
  onFocus,
}: {
  mode: TodoRecord | "new" | null;
  themed: ReturnType<typeof theme>;
  onClose: () => Promise<void> | void;
  onCreate: (input: CreateTodoInput) => Promise<unknown>;
  onUpdate: (id: number, fields: Partial<TodoRecord>) => Promise<unknown>;
  onFocus?: (todo: TodoRecord) => void;
}) {
  const t = themed;
  const isNew = mode === "new";
  const editing = mode && mode !== "new" ? mode : null;
  // Lazy initialisers read straight from the editing row — the parent keys
  // this component by todo id, so a fresh mount equals fresh state.
  const [title, setTitle] = useState(() => editing?.title ?? "");
  const [description, setDescription] = useState(
    () => editing?.description ?? "",
  );
  const [priority, setPriority] = useState<TodoPriority>(
    () => editing?.priority ?? "medium",
  );
  const [dueLocal, setDueLocal] = useState(() =>
    toLocalInput(editing?.due_at ?? null),
  );
  const [notifyLocal, setNotifyLocal] = useState(() =>
    toLocalInput(editing?.notify_at ?? null),
  );
  const [errs, setErrs] = useState<{
    due?: string | null;
    notify?: string | null;
  }>({});
  const [appear] = useState(() => new Animated.Value(0));

  useEffect(() => {
    appear.setValue(0);
    Animated.timing(appear, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [appear]);

  if (mode === null) return null;

  const dueTs = fromLocalInput(dueLocal);
  const notifyTs = fromLocalInput(notifyLocal);

  const save = async () => {
    if (!title.trim()) return;
    const dateError =
      validateNewTodoDates({ due_at: dueTs, notify_at: notifyTs }) ??
      (editing
        ? validateTodoDateChanges(
            { due_at: dueTs, notify_at: notifyTs },
            { due_at: editing.due_at, notify_at: editing.notify_at },
          )
        : null);
    if (dateError) {
      setErrs(
        dateError.startsWith("Due")
          ? { due: dateError }
          : { notify: dateError },
      );
      return;
    }
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      due_at: dueTs,
      notify_at: notifyTs,
    };
    if (isNew) await onCreate(payload);
    else if (editing) await onUpdate(editing.id, payload);
    await onClose();
  };

  const quickDue = (days: number | null) => {
    if (days === null) {
      setDueLocal("");
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(17, 0, 0, 0);
    setDueLocal(toLocalInput(asEpochSeconds(Math.floor(d.getTime() / 1000))));
    setErrs((e) => ({ ...e, due: undefined }));
  };

  return (
    <Modal transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View style={[sf.backdrop, { opacity: appear }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            sf.sheet,
            {
              backgroundColor: t.surface,
              transform: [
                {
                  translateY: appear.interpolate({
                    inputRange: [0, 1],
                    outputRange: [500, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={[sf.heading, { color: t.text }]}>
            {isNew ? "New task" : "Edit task"}
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={t.textMuted}
            style={[
              sf.input,
              { color: t.text, borderColor: t.border, backgroundColor: t.bg },
            ]}
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Description (optional)"
            placeholderTextColor={t.textMuted}
            multiline
            style={[
              sf.input,
              {
                color: t.text,
                borderColor: t.border,
                backgroundColor: t.bg,
                minHeight: 60,
              },
            ]}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {PRIORITIES.map((p) => (
              <Pressable
                key={p}
                onPress={() => setPriority(p)}
                style={[
                  sf.chip,
                  {
                    borderColor: priority === p ? t.accent : t.border,
                    backgroundColor: priority === p ? t.accent : "transparent",
                  },
                ]}
              >
                <Text
                  style={{
                    color: priority === p ? "#fff" : t.textMuted,
                    fontSize: 12,
                    fontWeight: "600",
                    textTransform: "capitalize",
                  }}
                >
                  {p}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[sf.label, { color: t.textMuted }]}>Due</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {DUE_CHOICES.map((c) => (
              <Pressable
                key={c.label}
                onPress={() => quickDue(c.days)}
                style={[sf.chip, { borderColor: t.border }]}
              >
                <Text style={{ color: t.text, fontSize: 12 }}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
          {errs.due ? (
            <Text style={{ color: t.danger, fontSize: 12 }}>{errs.due}</Text>
          ) : null}
          <TextInput
            value={dueLocal}
            onChangeText={(v) => {
              setDueLocal(v);
              setErrs((e) => ({
                ...e,
                due: pastDateError("due_at", fromLocalInput(v)),
              }));
            }}
            placeholder="Due — YYYY-MM-DD HH:MM (or empty)"
            placeholderTextColor={t.textMuted}
            style={[
              sf.input,
              { color: t.text, borderColor: t.border, backgroundColor: t.bg },
            ]}
            autoCapitalize="none"
          />
          <TextInput
            value={notifyLocal}
            onChangeText={(v) => {
              setNotifyLocal(v);
              setErrs((e) => ({
                ...e,
                notify: pastDateError("notify_at", fromLocalInput(v)),
              }));
            }}
            placeholder="Remind me — YYYY-MM-DD HH:MM (or empty)"
            placeholderTextColor={t.textMuted}
            style={[
              sf.input,
              { color: t.text, borderColor: t.border, backgroundColor: t.bg },
            ]}
            autoCapitalize="none"
          />
          {errs.notify ? (
            <Text style={{ color: t.danger, fontSize: 12 }}>{errs.notify}</Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
            {editing && onFocus ? (
              <Pressable
                onPress={() => onFocus(editing)}
                style={[sf.btn, { borderColor: t.border }]}
              >
                <Ionicons name="timer-outline" size={14} color={t.text} />
                <Text
                  style={{ color: t.text, fontWeight: "600", fontSize: 14 }}
                >
                  Focus
                </Text>
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={onClose}
              style={[sf.btn, { borderColor: t.border }]}
            >
              <Text style={{ color: t.text, fontWeight: "600", fontSize: 14 }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void save()}
              disabled={!title.trim()}
              style={[
                sf.btn,
                {
                  backgroundColor: t.accent,
                  borderColor: t.accent,
                  opacity: title.trim() ? 1 : 0.5,
                },
              ]}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                Save
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  error: {
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  undo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  todoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
  },
  check: { paddingTop: 1 },
  more: { paddingVertical: 2, paddingHorizontal: 2, alignSelf: "flex-start" },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 6,
    margin: 12,
    marginTop: 4,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  agentTag: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    paddingHorizontal: 3,
  },
});

const sf = StyleSheet.create({
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
    padding: 16,
    gap: 10,
    maxHeight: "92%",
  },
  heading: { fontSize: 17, fontWeight: "700" },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  label: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
