import { useAppStore, useAudioModels } from "@kotys/core";
import { ModelSelect } from "./ModelSelect";
import { ReferenceVoice } from "./ReferenceVoice";
import {
  SECTION_CLASS,
  SECTION_TEXT_CLASS,
  SECTION_TITLE_CLASS,
} from "./styles";

export function SpeechOutputSection() {
  const ttsModel = useAppStore((s) => s.ttsModel);
  const setTtsModel = useAppStore((s) => s.setTtsModel);
  const { models, loadError } = useAudioModels("tts");

  const handleChange = (setting: string | null) => {
    void setTtsModel(setting);
  };

  return (
    <section className={SECTION_CLASS}>
      <h3 className={SECTION_TITLE_CLASS}>Speech output</h3>
      <p className={SECTION_TEXT_CLASS}>
        Reads replies aloud with a text-to-speech model on the oMLX server. Use
        the speaker button on a reply; nothing plays on its own.
      </p>
      <ModelSelect
        label="Speech output model"
        models={models}
        loadError={loadError}
        selected={ttsModel}
        emptyText="No text-to-speech models available. Load one on the oMLX server."
        onChange={handleChange}
      />
      {ttsModel && <ReferenceVoice />}
    </section>
  );
}
