import type { ReactNode } from "react";
import { ReadAloudProvider } from "@saystack/react-native";
import { authHeaders, speechUrl, summarizeReply } from "../../lib/voiceConfig";

interface IProps {
  children: ReactNode;
}

export function SpeechProvider({ children }: IProps) {
  return (
    <ReadAloudProvider
      endpoint={speechUrl()}
      headers={authHeaders}
      summarize={summarizeReply}
    >
      {children}
    </ReadAloudProvider>
  );
}
