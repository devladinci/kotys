import { useCallback, useEffect, useState } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import type { MarkdownOptions, MarkdownStorage } from "tiptap-markdown";
import Blockquote from "@tiptap/extension-blockquote";
import Bold from "@tiptap/extension-bold";
import BulletList from "@tiptap/extension-bullet-list";
import Code from "@tiptap/extension-code";
import CodeBlock from "@tiptap/extension-code-block";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Italic from "@tiptap/extension-italic";
import ListItem from "@tiptap/extension-list-item";
import ListKeymap from "@tiptap/extension-list-keymap";
import OrderedList from "@tiptap/extension-ordered-list";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { Markdown } from "tiptap-markdown";
import type { SkillListing } from "@kotys/contracts";
import { composerConfig, setComposerConfig } from "./composerConfig";
import {
  SlashExtension,
  applySlashPick,
  getSlashMenuState,
  slashPluginKey,
} from "./slashExtension";

interface IProps {
  skills: SkillListing[];
  placeholder: string;
  onSend: (text: string, images: string[]) => void;
  getImages: () => string[];
}

interface IMarkdownStorage extends MarkdownStorage {
  options: MarkdownOptions;
}

type IMarkdownExtensionStorage = Record<string, unknown> & {
  markdown?: IMarkdownStorage;
};

const markdownOf = (editor: Editor): string => {
  const storage = (editor as unknown as { storage: IMarkdownExtensionStorage })
    .storage;
  return storage.markdown?.getMarkdown() ?? editor.getText();
};

export function useComposerEditor({
  skills,
  placeholder,
  onSend,
  getImages,
}: IProps) {
  const [isEmpty, setIsEmpty] = useState(true);

  // The editor captures its options once; later prop changes flow through
  // the config bus, read inside editor callbacks at call time.
  useEffect(() => {
    setComposerConfig({ onSend, getImages, skills, placeholder });
  });

  const sendNow = useCallback((activeEditor: Editor): boolean => {
    const text = markdownOf(activeEditor);
    const images = composerConfig.getImages();
    if (!text.trim() && images.length === 0) return true;
    composerConfig.onSend(text, images);
    activeEditor.commands.clearContent(true);
    return true;
  }, []);

  // Enter picks the highlighted skill; the Send button always sends.
  const submitKey = useCallback(
    (activeEditor: Editor): boolean => {
      const menu = getSlashMenuState();
      if (menu.isOpen && menu.items.length > 0) {
        return applySlashPick(activeEditor, menu.items[menu.index]);
      }
      return sendNow(activeEditor);
    },
    [sendNow],
  );

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Bold,
      Italic,
      Code,
      CodeBlock,
      BulletList,
      OrderedList,
      ListItem,
      ListKeymap,
      Blockquote,
      UndoRedo,
      Markdown.configure({
        html: false,
        transformPastedText: true,
      }),
      Placeholder.configure({ placeholder: () => composerConfig.placeholder }),
      SlashExtension.configure({ items: () => composerConfig.skills }),
    ],
    editorProps: {
      attributes: {
        "aria-label": "Message composer",
        class: "flex-1 min-w-0 text-sm text-text outline-none",
      },
      handleKeyDown: (_view, event): boolean => {
        if (event.key !== "Enter" || event.shiftKey) return false;
        if (!editor) return false;
        return submitKey(editor);
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const update = () => setIsEmpty(editor.isEmpty);
    update();
    editor.on("update", update);
    return () => {
      editor.off("update", update);
    };
  }, [editor]);

  const dismissMenu = useCallback(() => {
    if (!editor) return;
    if (slashPluginKey.getState(editor.state)?.active) {
      editor.view.dispatch(
        editor.state.tr.setMeta(slashPluginKey, { exit: true }),
      );
    }
  }, [editor]);

  const send = useCallback(() => {
    if (!editor) return;
    dismissMenu();
    sendNow(editor);
  }, [editor, dismissMenu, sendNow]);

  return { editor, send, isEmpty, dismissMenu };
}
