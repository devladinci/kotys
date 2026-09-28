import { useCallback, useEffect, useState } from "react";
import { Mic } from "lucide-react";
import {
  sttModelName,
  sttModelSetting,
  useAppStore,
  useRpc,
} from "@kotys/core";
import type { ModelListing } from "@kotys/contracts";
import SpeechOutputSettings from "./SpeechOutputSettings";

export default function VoiceSettings() {
  const rpc = useRpc();
  const sttModel = useAppStore((s) => s.sttModel);
  const setSttModel = useAppStore((s) => s.setSttModel);
  const [models, setModels] = useState<ModelListing[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ttsModels, setTtsModels] = useState<ModelListing[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await rpc.stt.models();
        if (!cancelled) setModels(list);
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      }
      try {
        const list = await rpc.tts.models();
        if (!cancelled) setTtsModels(list);
      } catch {
        // Speech output stays hidden on a listing failure; STT errors surface
        // above — no need to double-report the same oMLX outage.
        if (!cancelled) setTtsModels([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rpc]);

  const pick = useCallback(
    (name: string) => {
      if (!name) {
        void setSttModel(null);
        return;
      }
      const listing = (models ?? []).find((m) => m.name === name);
      void setSttModel(sttModelSetting(listing?.provider ?? "omlx", name));
    },
    [models, setSttModel],
  );

  const selectedName = sttModelName(sttModel);

  const omlxDisabled = loadError === "oMLX is disabled";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-text">
        <Mic size={18} className="text-accent" />
        <h2 className="text-base font-semibold">Voice</h2>
      </div>

      <p className="text-sm text-text-muted">
        Hold the mic button in the composer to dictate. Speech is transcribed
        locally on the oMLX server — the text is inserted into the composer,
        never sent automatically.
      </p>

      <section className="bg-surface border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text mb-1">
          Transcription model
        </h3>
        <p className="text-xs text-text-muted mb-4">
          Speech-to-text models served by oMLX.
        </p>
        {models === null && !loadError ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : omlxDisabled ? (
          <p className="text-sm text-text-muted">
            oMLX is not enabled — turn it on under{" "}
            <a href="/settings" className="text-accent hover:underline">
              General
            </a>
            .
          </p>
        ) : loadError ? (
          <p className="text-sm text-red-400">{loadError}</p>
        ) : (models ?? []).length === 0 ? (
          <p className="text-sm text-text-muted">
            No speech-to-text models available. Load one on the oMLX server.
          </p>
        ) : (
          <select
            value={selectedName ?? ""}
            onChange={(e) => pick(e.target.value)}
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

      <SpeechOutputSettings
        models={ttsModels}
        isLoadingModels={ttsModels === null}
      />
    </div>
  );
}
