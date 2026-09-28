import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { AudioStatus } from "expo-audio";
import { File, Paths } from "expo-file-system";
import type { ISpeechClip } from "@kotys/core";

let clipCount = 0;

export const unlockSpeech = (): void => {
  void setAudioModeAsync({ playsInSilentMode: true });
};

export const createSpeechClip = async (
  audio: ArrayBuffer,
): Promise<ISpeechClip> => {
  clipCount += 1;
  const file = new File(Paths.cache, `kotys-speech-${clipCount}.wav`);
  file.create({ overwrite: true });
  file.write(new Uint8Array(audio));
  const player = createAudioPlayer(file.uri);
  let finish: (() => void) | null = null;
  const subscription = player.addListener(
    "playbackStatusUpdate",
    (status: AudioStatus) => {
      if (status.didJustFinish) finish?.();
    },
  );

  return {
    play: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
        player.play();
      }),
    stop: () => {
      player.pause();
      finish?.();
    },
    release: () => {
      subscription.remove();
      player.remove();
      if (file.exists) file.delete();
    },
  };
};
