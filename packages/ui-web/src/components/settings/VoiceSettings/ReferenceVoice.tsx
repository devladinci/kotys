import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import {
  getConfig,
  transcribeVoice,
  uploadSpeechReference,
  useAppStore,
  useRpc,
} from "@kotys/core";
import { FIELD_CLASS } from "./styles";

interface IReferenceStatus {
  isSet: boolean;
  text: string;
}

const LABEL_CLASS = "block text-xs font-medium text-text-muted mb-1";

const FILE_INPUT_CLASS =
  "block text-xs text-text-muted file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-border file:bg-surface-2 file:text-text file:text-xs file:font-medium file:cursor-pointer hover:file:bg-border file:transition";

const SAVE_BUTTON_CLASS =
  "px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-accent-ink text-xs font-medium transition disabled:opacity-50";

const REMOVE_BUTTON_CLASS =
  "shrink-0 px-2 py-1 rounded-lg text-[11px] font-medium bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition";

export function ReferenceVoice() {
  const rpc = useRpc();
  const sttModel = useAppStore((s) => s.sttModel);
  const [status, setStatus] = useState<IReferenceStatus | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let isCancelled = false;
    rpc.tts.reference().then(
      (next) => {
        if (!isCancelled) setStatus(next);
      },
      (err: Error) => {
        if (!isCancelled) setError(err.message);
      },
    );

    return () => {
      isCancelled = true;
    };
  }, [rpc, revision]);

  const transcribe = async (picked: File) => {
    setIsTranscribing(true);
    try {
      const recording = { blob: picked, mimeType: picked.type || "audio/wav" };
      setTranscript(await transcribeVoice(getConfig(), recording));
    } catch {
      setTranscript("");
    } finally {
      setIsTranscribing(false);
    }
  };

  const save = async (picked: File) => {
    setIsSaving(true);
    setError(null);
    try {
      await uploadSpeechReference(getConfig(), picked, transcript.trim());
      setFile(null);
      setTranscript("");
      setRevision((value) => value + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    setError(null);
    try {
      await rpc.tts.removeReference();
      setRevision((value) => value + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    setFile(picked);
    setError(null);
    if (picked && sttModel) void transcribe(picked);
  };

  const handleTranscriptChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setTranscript(event.target.value);
  };

  const handleSave = () => {
    if (file) void save(file);
  };

  const handleRemove = () => {
    void remove();
  };

  const isSaveDisabled =
    !file || !transcript.trim() || isSaving || isTranscribing;

  return (
    <div className="mt-5 pt-4 border-t border-border space-y-3">
      <div>
        <h4 className="text-sm font-medium text-text">Reference voice</h4>
        <p className="text-xs text-text-muted">
          {status?.isSet
            ? "Replies are read in the voice of your reference clip."
            : "Without a reference clip the voice can change from one sentence to the next. Add a clean 5 to 15 second WAV recording and the words spoken in it."}
        </p>
      </div>
      {status?.isSet && (
        <div className="flex items-center gap-3">
          <span className="flex-1 min-w-0 truncate text-xs text-text-muted">
            “{status.text}”
          </span>
          <button onClick={handleRemove} className={REMOVE_BUTTON_CLASS}>
            Remove
          </button>
        </div>
      )}
      <div>
        <label htmlFor="tts-reference-file" className={LABEL_CLASS}>
          {status?.isSet ? "Replace with another clip" : "Clip (WAV)"}
        </label>
        <input
          key={revision}
          id="tts-reference-file"
          type="file"
          accept=".wav,audio/wav,audio/x-wav"
          onChange={handleFileChange}
          className={FILE_INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor="tts-reference-text" className={LABEL_CLASS}>
          Words spoken in the clip
        </label>
        <textarea
          id="tts-reference-text"
          rows={2}
          value={transcript}
          onChange={handleTranscriptChange}
          placeholder={
            isTranscribing ? "Transcribing…" : "Type exactly what the clip says"
          }
          className={FIELD_CLASS}
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={handleSave}
        disabled={isSaveDisabled}
        className={SAVE_BUTTON_CLASS}
      >
        {isSaving ? "Saving…" : "Save reference"}
      </button>
    </div>
  );
}
