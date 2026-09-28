import { sttModelName, sttModelSetting, useAppStore } from "@kotys/core";
import type { ModelListing } from "@kotys/contracts";
import type { ChangeEvent } from "react";

interface IProps {
  models: ModelListing[] | null;
  isLoadingModels: boolean;
}

export default function SpeechOutputSettings({
  models,
  isLoadingModels,
}: IProps) {
  const ttsModel = useAppStore((s) => s.ttsModel);
  const setTtsModel = useAppStore((s) => s.setTtsModel);

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
    </section>
  );
}
