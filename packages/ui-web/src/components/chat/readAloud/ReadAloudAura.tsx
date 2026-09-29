import type { TtsPhase } from "@saystack/core";
import { useAura } from "@saystack/react-web";
import type { AuraState } from "@saystack/web";
import { AURA_LAYER } from "./auraLayer";
import { useReadAloud } from "./useReadAloud";

interface IProps {
  clip: Element | null;
}

const MESSAGE_AURA = { outline: "full", lift: 22, placement: "top" } as const;

const AURA_STATE: Record<TtsPhase, AuraState> = {
  idle: "hidden",
  loading: "working",
  playing: "active",
  paused: "paused",
  done: "hidden",
  error: "hidden",
};

export function ReadAloudAura({ clip }: IProps) {
  const { speech, anchor, readLevels } = useReadAloud();
  const [state] = speech;

  useAura(anchor, {
    state: anchor ? AURA_STATE[state.phase] : "hidden",
    levels: readLevels,
    style: MESSAGE_AURA,
    padding: 12,
    clip,
    zIndex: AURA_LAYER,
  });

  return null;
}
