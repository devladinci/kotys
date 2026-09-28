import { Mic } from "lucide-react";
import { SpeechOutputSection } from "./SpeechOutputSection";
import { TranscriptionModelSection } from "./TranscriptionModelSection";

export default function VoiceSettings() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-text">
        <Mic size={18} className="text-accent" />
        <h2 className="text-base font-semibold">Voice</h2>
      </div>

      <p className="text-sm text-text-muted">
        Talk instead of typing, and listen to replies instead of reading them.
        Both run on your computer through the oMLX server.
      </p>

      <TranscriptionModelSection />

      <SpeechOutputSection />
    </div>
  );
}
