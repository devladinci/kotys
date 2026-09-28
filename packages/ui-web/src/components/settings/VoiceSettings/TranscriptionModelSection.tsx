import {
  audioModelChoice,
  audioModelOption,
  useAppStore,
  useAudioModels,
} from "@kotys/core";
import { ModelSelect } from "./ModelSelect";
import {
  SECTION_CLASS,
  SECTION_TEXT_CLASS,
  SECTION_TITLE_CLASS,
} from "./styles";

export function TranscriptionModelSection() {
  const sttModel = useAppStore((s) => s.sttModel);
  const setSttModel = useAppStore((s) => s.setSttModel);
  const { models, loadError } = useAudioModels("stt");

  const handleChange = (setting: string | null) => {
    void setSttModel(setting);
  };

  return (
    <section className={SECTION_CLASS}>
      <h3 className={SECTION_TITLE_CLASS}>Transcription model</h3>
      <p className={SECTION_TEXT_CLASS}>
        Hold the mic button in the composer to dictate. Speech is transcribed on
        the oMLX server.
      </p>
      <ModelSelect
        label="Transcription model"
        models={models}
        loadError={loadError}
        selected={audioModelChoice(sttModel)}
        emptyText="No speech-to-text models available. Load one on the oMLX server."
        optionOf={audioModelOption}
        onChange={handleChange}
      />
    </section>
  );
}
