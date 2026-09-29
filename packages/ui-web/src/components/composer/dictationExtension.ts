import { Extension, type Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

interface IWord {
  from: number;
  to: number;
  at: number;
}

interface IDictation {
  from: number;
  to: number;
  needsSpace: boolean;
  words: IWord[];
}

interface IDictationMeta {
  next: IDictation | null;
}

// Matches the entrance animation of saystack's streaming words.
const ENTER_MS = 520;

const dictationPluginKey = new PluginKey<IDictation | null>(
  "kotys-dictation",
);

const stateOf = (editor: Editor): IDictation | null =>
  dictationPluginKey.getState(editor.state) ?? null;

export const DictationExtension = Extension.create({
  name: "dictation",

  addProseMirrorPlugins() {
    return [
      new Plugin<IDictation | null>({
        key: dictationPluginKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(dictationPluginKey) as
              IDictationMeta | undefined;
            if (meta) return meta.next;
            if (!value || !tr.docChanged) return value;
            // Typing around the dictation moves it; the words it wrote stay its own.
            const from = tr.mapping.map(value.from, 1);
            const to = Math.max(from, tr.mapping.map(value.to, -1));
            return { ...value, from, to, words: [] };
          },
        },
        props: {
          decorations(state) {
            const dictation = dictationPluginKey.getState(state);
            if (!dictation) return null;
            const now = performance.now();
            const fresh = dictation.words.filter(
              (word) => now - word.at < ENTER_MS,
            );
            return DecorationSet.create(
              state.doc,
              fresh.map((word) =>
                Decoration.inline(word.from, word.to, {
                  class: "saystack-streaming-new",
                  // Re-rendered spans pick the animation up where it was.
                  style: `animation-delay: -${Math.round(now - word.at)}ms`,
                }),
              ),
            );
          },
        },
      }),
    ];
  },
});

const begin = (editor: Editor): IDictation => {
  const { doc } = editor.state;
  const at = Selection.atEnd(doc).from;
  const before = doc.resolve(at).parent.textContent;
  return {
    from: at,
    to: at,
    needsSpace: before !== "" && !/\s$/.test(before),
    words: [],
  };
};

/** Shows what has been heard so far at the end of the draft. */
export function showDictation(editor: Editor, text: string): void {
  const current = stateOf(editor) ?? begin(editor);
  const { state } = editor;
  const shown = state.doc.textBetween(current.from, current.to);
  const next = `${current.needsSpace ? " " : ""}${text}`;
  let same = 0;
  while (
    same < shown.length &&
    same < next.length &&
    shown[same] === next[same]
  ) {
    same += 1;
  }
  const start = current.from + same;
  const to = current.from + next.length;
  const tr = state.tr.insertText(next.slice(same), start, current.to);
  const kept = current.words.filter((word) => word.to <= start);
  const words =
    start < to ? [...kept, { from: start, to, at: performance.now() }] : kept;
  tr.setMeta(dictationPluginKey, {
    next: { ...current, to, words },
  } satisfies IDictationMeta);
  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
}

/**
 * Settles the dictation: the final text stays as one undo step, and the
 * caret moves after it. Null takes the dictated words back out.
 */
export function endDictation(editor: Editor, text: string | null): void {
  // A stream that never showed anything can still end with the recording's text.
  const current = stateOf(editor) ?? (text ? begin(editor) : null);
  if (!current) return;
  const clear = editor.state.tr
    .delete(current.from, current.to)
    .setMeta(dictationPluginKey, { next: null } satisfies IDictationMeta)
    .setMeta("addToHistory", false);
  editor.view.dispatch(clear);
  if (!text) return;
  const final = `${current.needsSpace ? " " : ""}${text}`;
  // Its own undo step, even right after typing.
  const insert = closeHistory(editor.state.tr.insertText(final, current.from));
  insert.setSelection(
    TextSelection.create(insert.doc, current.from + final.length),
  );
  editor.view.dispatch(insert);
  editor.commands.focus();
}
