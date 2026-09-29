import { DEFAULT_PLAYER_LABELS, SpeechPlayer } from "@saystack/react-web";
import { useReadAloud } from "./useReadAloud";

const ERRORS = { EMPTY_TEXT: "Nothing to read aloud in this reply" };

export function ReadAloudPlayer() {
  const { speech, anchor, readLevels } = useReadAloud();
  const [state] = speech;
  // The server explains its failures in plain words; show its reason.
  const labels = {
    errors: ERRORS,
    failed: state.errorMessage ?? DEFAULT_PLAYER_LABELS.failed,
  };

  const handleLocate = () =>
    anchor?.scrollIntoView({ block: "center", behavior: "smooth" });

  return (
    <SpeechPlayer
      speech={speech}
      levels={readLevels}
      labels={labels}
      onLocate={anchor ? handleLocate : undefined}
      className="mb-2"
    />
  );
}
