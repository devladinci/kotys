import { ScrollView } from "react-native";
import { useAppStore, useAudioModels } from "@kotys/core";
import { ModelPickerCard } from "./ModelPickerCard";
import { ReferenceStatus } from "./ReferenceStatus";
import { s } from "./styles";

export default function VoiceSection() {
  const sttModel = useAppStore((st) => st.sttModel);
  const setSttModel = useAppStore((st) => st.setSttModel);
  const ttsModel = useAppStore((st) => st.ttsModel);
  const setTtsModel = useAppStore((st) => st.setTtsModel);
  const stt = useAudioModels("stt");
  const tts = useAudioModels("tts");

  const handleSttChange = (setting: string | null) => {
    void setSttModel(setting);
  };

  const handleTtsChange = (setting: string | null) => {
    void setTtsModel(setting);
  };

  return (
    <ScrollView contentContainerStyle={s.content}>
      <ModelPickerCard
        title="Transcription model"
        description="Hold the mic in the chat to dictate. Speech is transcribed on your Mac."
        emptyText="No speech-to-text models available. Enable oMLX in the desktop app."
        models={stt.models}
        loadError={stt.loadError}
        selected={sttModel}
        onChange={handleSttChange}
      />
      <ModelPickerCard
        title="Speech output"
        description="Long-press a reply and choose Read aloud, or double-tap it. Nothing plays on its own."
        emptyText="No text-to-speech models available. Enable oMLX in the desktop app."
        models={tts.models}
        loadError={tts.loadError}
        selected={ttsModel}
        onChange={handleTtsChange}
      >
        {ttsModel ? <ReferenceStatus /> : null}
      </ModelPickerCard>
    </ScrollView>
  );
}
