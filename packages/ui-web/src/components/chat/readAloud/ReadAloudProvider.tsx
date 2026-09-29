import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getConfig, requestSpeechSummary } from "@kotys/core";
import { hasSpeechText } from "@saystack/core";
import { useSpeech } from "@saystack/react";
import { ReadAloudContext, type IReadAloud } from "./readAloudContext";
import { createSpeechOutput } from "./speechOutput";

interface IProps {
  children: ReactNode;
}

export function ReadAloudProvider({ children }: IProps) {
  const [output] = useState(createSpeechOutput);
  const speakingRef = useRef<number | null>(null);
  const [messageId, setMessageId] = useState<number | null>(null);
  const [summaryFor, setSummaryFor] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<Element | null>(null);

  useEffect(() => () => output.dispose(), [output]);

  const rewrite = useCallback(
    async (_markdown: string, signal: AbortSignal) => {
      const id = speakingRef.current;
      if (id === null) return null;
      const summary = await requestSpeechSummary(getConfig(), id, signal);
      if (speakingRef.current === id) {
        setSummaryFor(summary !== null && hasSpeechText(summary) ? id : null);
      }

      return summary;
    },
    [],
  );

  const [state, api] = useSpeech(output.driver, { rewrite });

  const speak = useCallback(
    (id: number, markdown: string) => {
      // The same reply again: play the audio already made for it instead of
      // summarizing and synthesizing it anew.
      if (id === messageId && markdown === state.text) {
        api.replay();
        return;
      }
      speakingRef.current = id;
      setMessageId(id);
      setSummaryFor(null);
      void api.speak(markdown);
    },
    [api, messageId, state.text],
  );

  const anchorMessage = useCallback((element: Element) => {
    setAnchor(element);

    return () => setAnchor((current) => (current === element ? null : current));
  }, []);

  const value = useMemo(
    (): IReadAloud => ({
      speech: [state, api],
      messageId,
      isSummary: summaryFor !== null && summaryFor === messageId,
      anchor,
      readLevels: output.readLevels,
      speak,
      anchorMessage,
    }),
    [state, api, messageId, summaryFor, anchor, output, speak, anchorMessage],
  );

  return (
    <ReadAloudContext.Provider value={value}>
      {children}
    </ReadAloudContext.Provider>
  );
}
