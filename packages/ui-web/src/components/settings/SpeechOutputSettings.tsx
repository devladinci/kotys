import {
  sttModelName,
  sttModelSetting,
  useAppStore,
  useRpc,
} from "@kotys/core";
import type { ModelListing } from "@kotys/contracts";
import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";

const TTS_REF_SETTING = "tts_ref_audio";
const TTS_REF_TEXT_SETTING = "tts_ref_audio_text";

interface IProps {
  models: ModelListing[] | null;
  isLoadingModels: boolean;
}

export default function SpeechOutputSettings({
  models,
  isLoadingModels,
}: IProps) {
  const rpc = useRpc();
  const ttsModel = useAppStore((s) => s.ttsModel);
  const setTtsModel = useAppStore((s) => s.setTtsModel);
  const [refPath, setRefPath] = useState("");
  const [refText, setRefText] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [path, text] = await Promise.all([
        rpc.settings.get({ key: TTS_REF_SETTING }),
        rpc.settings.get({ key: TTS_REF_TEXT_SETTING }),
      ]);
      if (cancelled) return;
      setRefPath(path.value || "");
      setRefText(text.value || "");
    };
    void load();
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRefPathBlur = () => {
    void rpc.settings.set({ key: TTS_REF_SETTING, value: refPath.trim() });
  };

  const handleRefTextBlur = () => {
    void rpc.settings.set({
      key: TTS_REF_TEXT_SETTING,
      value: refText.trim(),
    });
  };

  const handlePick = (name: string) => {
    if (!name) {
      void setTtsModel(null);
      return;
    }
    const listing = (models ?? []).find((m) => m.name === name);
    void setTtsModel(sttModelSetting(listing?.provider ?? "omlx", name));
  };

  const handleSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    handlePick(event.target.value);
  };

  const handleRefPathChange = (event: ChangeEvent<HTMLInputElement>) => {
    setRefPath(event.target.value);
  };

  const handleRefTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setRefText(event.target.value);
  };

  const selectedName = sttModelName(ttsModel);

  return (
    <section className="bg-surface border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-text mb-1">Speech output</h3>
      <p className="text-xs text-text-muted mb-4">
        Text-to-speech models served by oMLX. Adds a speaker button on replies —
        press it to hear the message aloud, nothing plays automatically.
      </p>
      {isLoadingModels ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : (models ?? []).length === 0 ? (
        <p className="text-sm text-text-muted">
          No text-to-speech models available. Load one on the oMLX server.
        </p>
      ) : (
        <select
          value={selectedName ?? ""}
          onChange={handleSelectChange}
          className="w-full max-w-xs bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
        >
          <option value="">None</option>
          {(models ?? []).map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
      )}
      <div className="mt-4">
        <label
          htmlFor="tts-ref-path"
          className="block text-xs font-medium text-text-muted mb-1"
        >
          Reference audio (absolute path to a .wav on the Mac)
        </label>
        <input
          id="tts-ref-path"
          type="text"
          value={refPath}
          onChange={handleRefPathChange}
          onBlur={handleRefPathBlur}
          placeholder="/path/to/reference.wav"
          className="w-full max-w-md bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
        />
        <label
          htmlFor="tts-ref-text"
          className="block text-xs font-medium text-text-muted mt-3 mb-1"
        >
          What the reference says (transcript)
        </label>
        <textarea
          id="tts-ref-text"
          value={refText}
          onChange={handleRefTextChange}
          onBlur={handleRefTextBlur}
          rows={2}
          placeholder="Здравей! Как звуча сега? Говоря български език."
          className="w-full max-w-md bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
        />
        <p className="text-xs text-text-muted mt-2">
          Optional voice cloning — the spoken voice will match the reference.
        </p>
      </div>
    </section>
  );
}
