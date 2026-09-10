import { memo, useCallback, useEffect, useRef, useState } from "react";
import type {
  DragEvent as ReactDragEvent,
  ChangeEvent as ReactChangeEvent,
} from "react";
import { EditorContent } from "@tiptap/react";
import { ImagePlus, ListPlus, Send, Square, X } from "lucide-react";
import {
  usePlatform,
  useSkills,
  useVoiceInput,
  type QueuedMessage,
} from "@kotys/core";
import type { SkillListing } from "@kotys/contracts";
import MicButton from "../chat/MicButton";
import SlashMenu from "./SlashMenu";
import { useComposerEditor } from "./useComposerEditor";
import { useSlashMenu, applySlashPick } from "./slashExtension";

const MAX_IMAGES = 4;
const IMAGE_MAX_DIM = 1536;

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const prepareImage = async (file: File): Promise<string> => {
  const dataUrl = await readFileAsDataUrl(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("unreadable image"));
    img.src = dataUrl;
  });
  const scale = Math.min(1, IMAGE_MAX_DIM / Math.max(img.width, img.height));
  if (scale === 1 && dataUrl.length < 700_000) return dataUrl;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
};

interface IProps {
  needsApiKey: boolean;
  modelName: string;
  visionCapable: boolean;
  hasMessages: boolean;
  isLoading: boolean;
  streamingId: number | null;
  queuedMessages: QueuedMessage[];
  onSend: (text: string, images: string[]) => void;
  onAbort: () => void;
  onDequeue: (id: number) => void;
}

function ComposerBase({
  needsApiKey,
  modelName,
  visionCapable,
  hasMessages,
  isLoading,
  streamingId,
  queuedMessages,
  onSend,
  onAbort,
  onDequeue,
}: IProps) {
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const { skills } = useSkills();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const addImages = useCallback(async (files: Iterable<File>) => {
    const all = [...files];
    const imageFiles = all.filter((f) => f.type.startsWith("image/"));
    const nonImageCount = all.length - imageFiles.length;
    const overflow = Math.max(0, imageFiles.length - MAX_IMAGES);
    const ignored = nonImageCount + overflow;
    if (ignored > 0) {
      setRejectedCount(ignored);
      clearTimeout(noteTimer.current ?? undefined);
      noteTimer.current = setTimeout(() => setRejectedCount(0), 2500);
    }
    const prepared: string[] = [];
    for (const file of imageFiles.slice(0, MAX_IMAGES)) {
      try {
        prepared.push(await prepareImage(file));
      } catch {
        /* skip unreadable image files */
      }
    }
    if (prepared.length > 0) {
      setPendingImages((prev) => [...prev, ...prepared].slice(0, MAX_IMAGES));
    }
  }, []);

  const clearPending = useCallback(() => {
    setPendingImages([]);
    setRejectedCount(0);
    setVoiceError(null);
  }, []);

  const sendWithImages = useCallback(
    (text: string, images: string[]) => {
      onSend(text, images);
      clearPending();
    },
    [onSend, clearPending],
  );

  const effectiveImages = visionCapable ? pendingImages : [];

  const handleDragOver = (e: ReactDragEvent) => {
    e.preventDefault();
    if (visionCapable && !dragOver) setDragOver(true);
  };

  const handleDragLeave = (e: ReactDragEvent) => {
    if (e.currentTarget === e.target) setDragOver(false);
  };

  const handleDrop = (e: ReactDragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (visionCapable && e.dataTransfer.files.length > 0)
      void addImages(e.dataTransfer.files);
  };

  const handleFileInput = (e: ReactChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) void addImages(e.target.files);
    e.target.value = "";
  };

  const handleRemoveImage = (removeIndex: number) => {
    setPendingImages((prev) => prev.filter((_, j) => j !== removeIndex));
  };

  const { editor, send, isEmpty } = useComposerEditor({
    skills,
    placeholder: needsApiKey
      ? "Set API key in settings..."
      : hasMessages
        ? "Reply to continue the conversation..."
        : "Ask anything to start a new conversation...",
    onSend: sendWithImages,
    getImages: () => effectiveImages,
  });

  const voice = useVoiceInput(usePlatform(), (text) => {
    sendWithImages(text, effectiveImages);
    editor?.commands.clearContent(true);
  });

  useEffect(() => {
    if (voice.status !== "error") return;
    /* eslint-disable react-hooks/set-state-in-effect -- transient note, mirrors the rejected-image strip */
    setVoiceError(voice.error ?? "Voice input failed");
    noteTimer.current = setTimeout(() => setVoiceError(null), 4000);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [voice.status, voice.error]);

  const menu = useSlashMenu();

  const pickSkill = useCallback(
    (skill: SkillListing) => {
      if (editor) applySlashPick(editor, skill);
    },
    [editor],
  );

  const canSend = !isEmpty || effectiveImages.length > 0;

  return (
    <div className="komposer relative">
      {menu.isOpen && (
        <SlashMenu
          items={menu.items}
          index={menu.index}
          onPick={pickSkill}
        />
      )}
      <div
        className={`bg-surface rounded-xl border p-1.5 transition ${
          dragOver
            ? "border-accent ring-2 ring-accent/30 bg-accent/5"
            : "border-border focus-within:border-accent"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {dragOver && visionCapable && (
          <div className="mb-2 text-xs text-accent font-medium text-center py-1">
            Drop images to attach
          </div>
        )}
        {rejectedCount > 0 && (
          <div
            className="mb-2 text-xs text-amber-400 text-center py-1"
            role="status"
            aria-live="polite"
          >
            {rejectedCount} file{rejectedCount > 1 ? "s" : ""} ignored
            {rejectedCount > MAX_IMAGES ? ` — max ${MAX_IMAGES} images` : ""}
          </div>
        )}
        {voiceError && (
          <div
            className="mb-2 text-xs text-amber-400 text-center py-1"
            role="status"
            aria-live="polite"
          >
            {voiceError}
          </div>
        )}
        {!visionCapable && pendingImages.length > 0 && (
          <div
            className="mb-2 text-xs text-amber-400 text-center py-1"
            role="status"
            aria-live="polite"
          >
            Attachments held back — this model does not support images
          </div>
        )}
        {pendingImages.length > 0 && (
          <div
            className={`flex flex-wrap gap-2 mb-2 ${visionCapable ? "" : "opacity-40"}`}
          >
            {pendingImages.map((src, i) => (
              <div key={src.slice(-24) + i} className="relative">
                <img
                  src={src}
                  alt="Pending attachment"
                  className="h-14 w-14 object-cover rounded-lg border border-border"
                />
                <button
                  onClick={() => handleRemoveImage(i)}
                  aria-label="Remove attachment"
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-surface-2 border border-border flex items-center justify-center hover:bg-red-500 hover:text-white transition"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        {queuedMessages.length > 0 && (
          <div className="mb-2" role="status" aria-live="polite">
            <div className="flex items-center gap-1.5 mb-1 text-[11px] text-text-muted">
              <ListPlus size={11} />
              {queuedMessages.length} queued — sends when the reply finishes
            </div>
            <div className="flex flex-col gap-1">
              {queuedMessages.map((q) => (
                <div
                  key={q.id}
                  className="group flex items-center gap-2 px-2 py-1 rounded-lg bg-surface-2 border border-border text-xs"
                >
                  <span className="flex-1 min-w-0 truncate text-text-muted">
                    {q.text || "(images)"}
                  </span>
                  <button
                    onClick={() => onDequeue(q.id)}
                    aria-label="Remove queued message"
                    className="shrink-0 p-0.5 rounded text-text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-400 transition"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-end gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />
          <MicButton
            status={voice.status}
            onStart={() => void voice.start()}
            onStop={voice.stop}
            onCancel={voice.cancel}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!visionCapable}
            aria-label="Attach images"
            title={
              visionCapable
                ? "Attach images"
                : `${modelName} does not support images`
            }
            className="grid h-8 w-7 shrink-0 place-items-center rounded-lg text-text-muted hover:text-text hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-muted transition"
          >
            <ImagePlus size={16} />
          </button>
          <EditorContent editor={editor} className="flex-1 min-w-0" />
          {streamingId !== null ? (
            <>
              <button
                onClick={send}
                disabled={!canSend}
                title="Queue message"
                aria-label="Queue message"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 hover:bg-surface-2/70 text-text-muted hover:text-text transition disabled:opacity-40"
              >
                <ListPlus size={16} />
              </button>
              <button
                onClick={onAbort}
                title="Stop generating"
                aria-label="Stop generating"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 hover:bg-red-500/20 text-text transition"
              >
                <Square size={16} fill="currentColor" />
              </button>
            </>
          ) : (
            <button
              onClick={send}
              disabled={isLoading || !canSend}
              aria-label="Send message"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:hover:bg-accent text-white transition"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const Composer = memo(ComposerBase);
export default Composer;