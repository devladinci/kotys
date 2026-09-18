import { memo, useCallback, useEffect, useRef, useState } from "react";
import type {
  DragEvent as ReactDragEvent,
  ChangeEvent as ReactChangeEvent,
} from "react";
import { EditorContent } from "@tiptap/react";
import { ImagePlus, ListPlus, Send, Square, X } from "lucide-react";
import {
  queueCaption,
  usePlatform,
  useSkills,
  useVoiceInput,
} from "@kotys/core";
import type { QueuedMessage } from "@kotys/core";
import type { SkillListing } from "@kotys/contracts";
import MicButton from "../chat/MicButton";
import SlashMenu from "./SlashMenu";
import { QueuedMessageRow } from "./QueuedMessageRow";
import { StatusNote } from "./StatusNote";
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
  isApiKeyMissing: boolean;
  modelName: string;
  isVisionCapable: boolean;
  hasMessages: boolean;
  isLoading: boolean;
  streamingId: number | null;
  queuedMessages: QueuedMessage[];
  onSend: (text: string, images: string[]) => void;
  onAbort: () => void;
  onDequeue: (id: number) => void;
  onSteer?: (id: number) => void;
}

interface IPendingImage {
  id: number;
  src: string;
}

function ComposerBase({
  isApiKeyMissing,
  modelName,
  isVisionCapable,
  hasMessages,
  isLoading,
  streamingId,
  queuedMessages,
  onSend,
  onAbort,
  onDequeue,
  onSteer,
}: IProps) {
  const [pendingImages, setPendingImages] = useState<IPendingImage[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const { skills } = useSkills();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const nextImageId = useRef(0);

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
    const prepared: IPendingImage[] = [];
    for (const file of imageFiles.slice(0, MAX_IMAGES)) {
      const src = await prepareImage(file).catch(() => null);
      if (src === null) continue;
      nextImageId.current += 1;
      prepared.push({ id: nextImageId.current, src });
    }
    if (prepared.length === 0) return;
    setPendingImages((prev) => [...prev, ...prepared].slice(0, MAX_IMAGES));
  }, []);

  const clearPending = useCallback(() => {
    setPendingImages([]);
    setRejectedCount(0);
    setVoiceError(null);
  }, []);

  const handleSend = useCallback(
    (text: string, images: string[]) => {
      onSend(text, images);
      clearPending();
    },
    [onSend, clearPending],
  );

  const isStreaming = streamingId !== null;
  const effectiveImages = isVisionCapable
    ? pendingImages.map((image) => image.src)
    : [];

  const handleDragOver = (e: ReactDragEvent) => {
    e.preventDefault();
    if (isVisionCapable && !dragOver) setDragOver(true);
  };

  const handleDragLeave = (e: ReactDragEvent) => {
    if (e.currentTarget === e.target) setDragOver(false);
  };

  const handleDrop = (e: ReactDragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (isVisionCapable && e.dataTransfer.files.length > 0)
      void addImages(e.dataTransfer.files);
  };

  const handleFileInput = (e: ReactChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) void addImages(e.target.files);
    e.target.value = "";
  };

  const handleRemoveImage = (id: number) => {
    setPendingImages((prev) => prev.filter((image) => image.id !== id));
  };

  const handleAttachClick = () => fileInputRef.current?.click();

  const { editor, send, isEmpty } = useComposerEditor({
    skills,
    placeholder: isApiKeyMissing
      ? "Set API key in settings..."
      : hasMessages
        ? "Reply to continue the conversation..."
        : "Ask anything to start a new conversation...",
    onSend: handleSend,
    getImages: () => effectiveImages,
  });

  const platform = usePlatform();

  // The draft stays: dictation sends its own message beside it.
  const handleTranscript = (text: string) => {
    handleSend(text, effectiveImages);
  };

  const voice = useVoiceInput(platform, handleTranscript);

  const handleVoiceStart = () => {
    void voice.start();
  };

  useEffect(() => {
    if (voice.status !== "error") return;
    /* eslint-disable react-hooks/set-state-in-effect -- transient note, mirrors the rejected-image strip */
    setVoiceError(voice.error ?? "Voice input failed");
    noteTimer.current = setTimeout(() => setVoiceError(null), 4000);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [voice.status, voice.error]);

  const menu = useSlashMenu();

  const handleSkillPick = useCallback(
    (skill: SkillListing) => {
      if (editor) applySlashPick(editor, skill);
    },
    [editor],
  );

  const canSend = !isEmpty || effectiveImages.length > 0;

  return (
    <div className="komposer relative">
      {menu.isOpen && menu.items.length > 0 && (
        <SlashMenu
          items={menu.items}
          index={menu.index}
          onPick={handleSkillPick}
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
        {dragOver && isVisionCapable && (
          <div className="mb-2 text-xs text-accent font-medium text-center py-1">
            Drop images to attach
          </div>
        )}
        {rejectedCount > 0 && (
          <StatusNote>
            {rejectedCount} file{rejectedCount > 1 ? "s" : ""} ignored
            {rejectedCount > MAX_IMAGES ? ` — max ${MAX_IMAGES} images` : ""}
          </StatusNote>
        )}
        {voiceError && <StatusNote>{voiceError}</StatusNote>}
        {!isVisionCapable && pendingImages.length > 0 && (
          <StatusNote>
            Attachments held back — this model does not support images
          </StatusNote>
        )}
        {pendingImages.length > 0 && (
          <div
            className={`flex flex-wrap gap-2 mb-2 ${isVisionCapable ? "" : "opacity-40"}`}
          >
            {pendingImages.map((image) => (
              <div key={image.id} className="relative">
                <img
                  src={image.src}
                  alt="Pending attachment"
                  className="h-14 w-14 object-cover rounded-lg border border-border"
                />
                <button
                  onClick={() => handleRemoveImage(image.id)}
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
              {queueCaption(isStreaming, queuedMessages.length)}
            </div>
            <div className="flex flex-col gap-1">
              {queuedMessages.map((queued) => (
                <QueuedMessageRow
                  key={queued.id}
                  message={queued}
                  streamingId={streamingId}
                  onDequeue={onDequeue}
                  onSteer={onSteer}
                />
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
            onStart={handleVoiceStart}
            onStop={voice.stop}
            onCancel={voice.cancel}
          />
          <button
            onClick={handleAttachClick}
            disabled={!isVisionCapable}
            aria-label="Attach images"
            title={
              isVisionCapable
                ? "Attach images"
                : `${modelName} does not support images`
            }
            className="grid h-8 w-7 shrink-0 place-items-center rounded-lg text-text-muted hover:text-text hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-muted transition"
          >
            <ImagePlus size={16} />
          </button>
          <EditorContent editor={editor} className="flex-1 min-w-0" />
          {isStreaming ? (
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
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:hover:bg-accent text-accent-ink transition"
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
