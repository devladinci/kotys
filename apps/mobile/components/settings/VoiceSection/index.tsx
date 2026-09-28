import { ScrollView } from "react-native";
import {
  audioModelChoice,
  audioModelOption,
  chatModelOption,
  useAppStore,
  useAudioModels,
  useModels,
} from "@kotys/core";
import { ModelPickerCard } from "./ModelPickerCard";
import { ReferenceStatus } from "./ReferenceStatus";
import { s } from "./styles";

export default function VoiceSection() {
  const sttModel = useAppStore((st) => st.sttModel);
  const setSttModel = useAppStore((st) => st.setSttModel);
  const ttsModel = useAppStore((st) => st.ttsModel);
  const setTtsModel = useAppStore((st) => st.setTtsModel);
  const ttsSummaryModel = useAppStore((st) => st.ttsSummaryModel);
  const setTtsSummaryModel = useAppStore((st) => st.setTtsSummaryModel);
  const stt = useAudioModels("stt");
  const tts = useAudioModels("tts");
  const chatModels = useModels();

  const handleSttChange = (setting: string | null) => {
    void setSttModel(setting);
  };

  const handleTtsChange = (setting: string | null) => {
    void setTtsModel(setting);
  };

  const handleSummaryChange = (key: string | null) => {
    const model = chatModels.find((m) => chatModelOption(m).key === key);
    void setTtsSummaryModel(model ?? null);
  };

  return (
    <ScrollView contentContainerStyle={s.content}>
      <ModelPickerCard
        title="Transcription model"
        description="Hold the mic in the chat to dictate. Speech is transcribed on your Mac."
        emptyText="No speech-to-text models available. Enable oMLX in the desktop app."
        models={stt.models}
        loadError={stt.loadError}
        selected={audioModelChoice(sttModel)}
        optionOf={audioModelOption}
        onChange={handleSttChange}
      />
      <ModelPickerCard
        title="Speech output"
        description="Long-press a reply and choose Read aloud, or double-tap it. Nothing plays on its own."
        emptyText="No text-to-speech models available. Enable oMLX in the desktop app."
        models={tts.models}
        loadError={tts.loadError}
        selected={audioModelChoice(ttsModel)}
        optionOf={audioModelOption}
        onChange={handleTtsChange}
      >
        {ttsModel ? <ReferenceStatus /> : null}
      </ModelPickerCard>
      {ttsModel ? (
        <ModelPickerCard
          title="Summaries for long replies"
          description="Long replies, and replies with tables or code, are read as a short summary written by this model when you play them. Pick a fast model; its reasoning is turned off. With None, every reply is read in full."
          emptyText="No chat models available yet."
          models={chatModels}
          loadError={null}
          selected={ttsSummaryModel ? chatModelOption(ttsSummaryModel) : null}
          optionOf={chatModelOption}
          onChange={handleSummaryChange}
        />
      ) : null}
    </ScrollView>
  );
}
