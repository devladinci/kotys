import { useAppStore } from "@kotys/core";
import type { IAuraStyle, TtsPhase } from "@saystack/core";
import { useAura } from "@saystack/react-web";
import type { AuraState } from "@saystack/web";
import { AURA_LAYER } from "./auraLayer";
import { useReadAloud } from "./useReadAloud";

interface IProps {
  clip: Element | null;
}

const MESSAGE_SHAPE = {
  outline: "full",
  placement: "top",
  lift: 16,
} as const;

// Light adds up on dark backgrounds, so the same glow reads much louder there.
const MESSAGE_AURA: Record<"light" | "dark", Partial<IAuraStyle>> = {
  dark: {
    ...MESSAGE_SHAPE,
    lineWidth: 1.2,
    blur: 6,
    aura: 0.45,
    auraSize: 6,
    brightness: 0.28,
  },
  light: {
    ...MESSAGE_SHAPE,
    lineWidth: 1.8,
    blur: 2,
    aura: 0.75,
    auraSize: 8,
    brightness: 0.55,
  },
};

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
  const resolvedTheme = useAppStore((s) => s.resolvedTheme);
  const [state] = speech;

  useAura(anchor, {
    state: anchor ? AURA_STATE[state.phase] : "hidden",
    levels: readLevels,
    style: MESSAGE_AURA[resolvedTheme],
    padding: 12,
    clip,
    zIndex: AURA_LAYER,
  });

  return null;
}
