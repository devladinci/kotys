import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard } from "react-native";
import { MAX_IMAGES } from "../../lib/images";

export function useChatScreen() {
  const [draft, setDraft] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const [kbHeight, setKbHeight] = useState(0);
  const [modelSheet, setModelSheet] = useState(false);
  const [thinkSheet, setThinkSheet] = useState(false);
  const [modeSheet, setModeSheet] = useState(false);
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(
    null,
  );
  const [pendingImages, setPendingImages] = useState<string[]>([]);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardWillShow", (e) =>
      setKbHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener("keyboardWillHide", () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const pinBottom = useCallback(() => {
    atBottomRef.current = true;
    setAtBottom(true);
  }, []);

  const addPendingImages = useCallback((urls: string[]) => {
    if (urls.length === 0) return;
    setPendingImages((prev) => [...prev, ...urls].slice(0, MAX_IMAGES));
  }, []);

  const removePendingImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, j) => j !== index));
  }, []);

  const clearDraft = useCallback(() => {
    setDraft("");
    setPendingImages([]);
  }, []);

  return {
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
    setPendingImages,
    pinBottom,
    addPendingImages,
    removePendingImage,
    clearDraft,
  };
}
