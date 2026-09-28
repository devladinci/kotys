import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { AudioPlayer, AudioStatus } from "expo-audio";
import { File, Paths } from "expo-file-system";
import { getConfig } from "@kotys/core";

interface SpeechRequest {
  text: string;
}

const SPEECH_FILE = "kotys-speech.wav";

const writeWav = (audio: ArrayBuffer): string => {
  const file = new File(Paths.cache, SPEECH_FILE);
  file.write(new Uint8Array(audio));
  return file.uri;
};

const requestSpeech = async (
  config: { baseUrl: string; token: string },
  req: SpeechRequest,
): Promise<ArrayBuffer> => {
  const res = await fetch(`${config.baseUrl}/tts/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Speech synthesis failed (${res.status})`);
  }
  return res.arrayBuffer();
};

let player: AudioPlayer | null = null;

const teardown = () => {
  player?.remove();
  player = null;
};

export const playSpeech = async (req: SpeechRequest): Promise<void> => {
  if (player) teardown();
  const audio = await requestSpeech(getConfig(), req);
  const uri = writeWav(audio);
  await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  const next = createAudioPlayer(uri);
  player = next;
  next.play();
  await new Promise<void>((resolve) => {
    next.addListener("playbackStatusUpdate", (status: AudioStatus) => {
      if (!player || player !== next) return;
      if (status.didJustFinish) resolve();
    });
  });
  if (player === next) teardown();
};

export const stopSpeech = () => {
  if (!player) return;
  teardown();
};
