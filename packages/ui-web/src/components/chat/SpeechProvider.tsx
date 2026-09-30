import type { ReactNode } from "react";
import { ReadAloudProvider } from "@saystack/react-web";
import { authHeaders, daemonUrl, summarizeReply } from "../../voiceConfig";

interface IProps {
  children: ReactNode;
}

export function SpeechProvider({ children }: IProps) {
  return (
    <ReadAloudProvider
      endpoint={daemonUrl("/tts/speech")}
      headers={authHeaders}
      summarize={summarizeReply}
    >
      {children}
    </ReadAloudProvider>
  );
}
