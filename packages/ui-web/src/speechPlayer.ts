export type SpeechPlayer = {
  play: (audio: Blob) => Promise<void>;
  stop: () => void;
};

export function createSpeechPlayer(): SpeechPlayer {
  let element: HTMLAudioElement | null = null;
  let url: string | null = null;

  const release = () => {
    if (url) {
      URL.revokeObjectURL(url);
      url = null;
    }
    element = null;
  };

  return {
    async play(audio) {
      element?.pause();
      release();
      url = URL.createObjectURL(audio);
      const next = new Audio(url);
      element = next;
      try {
        await next.play();
        await new Promise<void>((resolve, reject) => {
          next.onended = () => resolve();
          next.onerror = () => reject(new Error("Speech playback failed"));
        });
      } finally {
        if (element === next) release();
      }
    },
    stop() {
      element?.pause();
      release();
    },
  };
}
