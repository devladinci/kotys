import { AudioModule, setAudioModeAsync } from "expo-audio";
import type { AudioRecorder, RecordingOptions } from "expo-audio";
import { IOSOutputFormat, AudioQuality } from "expo-audio";
import { File } from "expo-file-system";
import type { VoiceRecording } from "@kotys/core";

/**
 * 16 kHz mono 16-bit PCM wav — the format parakeet accepts directly
 * (verified against oMLX).
 */
const WAV_RECORDING_OPTIONS: Partial<RecordingOptions> = {
  extension: ".wav",
  sampleRate: 16000,
  numberOfChannels: 1,
  ios: {
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.LOW,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  android: {
    // Android MediaRecorder has no PCM wav output; this yields AAC in an
    // mpeg4 container with a .wav name — unverified against parakeet.
    outputFormat: "mpeg4",
    audioEncoder: "aac",
    extension: ".wav",
  },
};

let recorder: AudioRecorder | null = null;

export const startVoiceRecording = async (): Promise<void> => {
  const permission = await AudioModule.requestRecordingPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Microphone permission denied");
  }
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
  });
  recorder = new AudioModule.AudioRecorder(WAV_RECORDING_OPTIONS);
  await recorder.prepareToRecordAsync();
  recorder.record();
};

export const stopVoiceRecording = async (): Promise<VoiceRecording> => {
  const rec = recorder;
  recorder = null;
  if (!rec) throw new Error("Not recording");
  await rec.stop();
  await setAudioModeAsync({ allowsRecording: false });
  if (!rec.uri) throw new Error("Recording produced no file");
  // An instant tap can produce an empty file; the server would only return
  // a cryptic upstream error for it.
  if (new File(rec.uri).size === 0) {
    throw new Error("Recording was too short");
  }
  return { uri: rec.uri, mimeType: "audio/wav" };
};
