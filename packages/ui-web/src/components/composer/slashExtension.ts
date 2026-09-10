import { useSyncExternalStore } from "react";
import { Extension, type Editor } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import {
  exitSuggestion,
  Suggestion,
  type SuggestionKeyDownProps,
} from "@tiptap/suggestion";
import type { SkillListing } from "@kotys/contracts";

export interface ISlashExtensionProps {
  items: () => SkillListing[];
}

export interface ISlashMenuState {
  isOpen: boolean;
  query: string;
  items: SkillListing[];
  index: number;
}

export const slashPluginKey = new PluginKey<ISuggestionState>("kotys-slash");

interface ISuggestionState {
  active: boolean;
  range: { from: number; to: number };
  query: string | null;
}

const closedMenu: ISlashMenuState = {
  isOpen: false,
  query: "",
  items: [],
  index: 0,
};

let menuState = closedMenu;
const listeners = new Set<() => void>();

const setMenuState = (next: ISlashMenuState) => {
  menuState = next;
  for (const listener of listeners) listener();
};

const subscribeMenu = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getSlashMenuState = (): ISlashMenuState => menuState;

export const useSlashMenu = (): ISlashMenuState =>
  useSyncExternalStore(subscribeMenu, () => menuState);

export const setSlashIndex = (index: number) => {
  if (menuState.index !== index) setMenuState({ ...menuState, index });
};

export const applySlashPick = (
  editor: Editor,
  skill: SkillListing,
): boolean => {
  const state = slashPluginKey.getState(editor.state);
  if (!state?.active) return false;
  const args = editor.state.doc
    .textBetween(state.range.to, editor.state.selection.to, "\n")
    .trim();
  const text = args ? `/${skill.name} ${args}` : `/${skill.name}`;
  exitSuggestion(editor.view, slashPluginKey);
  editor
    .chain()
    .focus()
    .insertContentAt(
      state.range,
      { type: "text", text },
      { updateSelection: true },
    )
    .run();
  return true;
};

export const SlashExtension = Extension.create<ISlashExtensionProps>({
  name: "kotysSlash",

  addOptions() {
    return { items: () => [] };
  },

  addProseMirrorPlugins() {
    const getItems = this.options.items;
    const editor = this.editor;
    return [
      Suggestion<SkillListing, SkillListing>({
        pluginKey: slashPluginKey,
        editor,
        char: "/",
        startOfLine: true,
        items: ({ query }) => {
          const q = query.toLowerCase();
          const all = getItems();
          if (!q) return all;
          return all.filter(
            (s) =>
              s.name.includes(q) || s.description.toLowerCase().includes(q),
          );
        },
        command: ({ editor: pickEditor, props: skill }) => {
          applySlashPick(pickEditor, skill);
        },
        render: () => ({
          onStart: ({ query, items: rows }) =>
            setMenuState({ isOpen: true, query, items: rows, index: 0 }),
          onUpdate: ({ query, items: rows }) =>
            setMenuState({ isOpen: true, query, items: rows, index: 0 }),
          onExit: () => setMenuState(closedMenu),
          onKeyDown: ({ event }: SuggestionKeyDownProps) => {
            if (menuState.items.length === 0) return false;
            if (event.key === "ArrowDown") {
              setSlashIndex(
                Math.min(menuState.index + 1, menuState.items.length - 1),
              );
              return true;
            }
            if (event.key === "ArrowUp") {
              setSlashIndex(Math.max(menuState.index - 1, 0));
              return true;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              return applySlashPick(editor, menuState.items[menuState.index]);
            }
            return false;
          },
        }),
        // Escape dismisses only while the exact match is unchanged; a pick
        // (args inserted) or edit reactivates the menu.
        shouldResetDismissed: ({ match, range: dismissedRange }) =>
          match.range.from !== dismissedRange.from ||
          match.range.to !== dismissedRange.to,
      }),
    ];
  },
});
