import { createContext, useContext, type ReactNode } from "react";
import type { KotysConfig } from "@kotys/client";
import type { RouterClient } from "@orpc/server";
import type { AppRouter, ClientMessage, ServerMessage } from "@kotys/api";
import { setClients, getRpc } from "./clients.js";
import { useMemoOnce } from "./useMemoOnce.js";

export type { ClientMessage, ServerMessage };

/**
 * Capabilities the host app provides.
 *
 * Everything here is something React Native does differently from the DOM.
 * Keeping them in one injected object is what lets every hook below stay
 * platform-free.
 */
export type Platform = {
  /** Scroll a message into view. DOM apps query the node; RN uses a list ref. */
  scrollToMessage: (messageId: number) => void;
  /** Whether the OS is in dark mode, and a subscription to changes. */
  prefersDark: () => boolean;
  onPrefersDarkChange?: (cb: (dark: boolean) => void) => () => void;
  /** Open an external URL — system browser on desktop, in-app sheet on mobile. */
  openExternal: (url: string) => void;
  /**
   * Subscribe to app foreground transitions (mobile only). A phone's socket
   * dies silently while backgrounded; hosts can use this to resync. Undefined
   * on desktop/web, where the app is always visible.
   */
  onAppForeground?: (cb: () => void) => () => void;
  /**
   * Show or schedule a notification. `chatId` marks a finished turn, which the
   * host may suppress while that reply is on screen.
   */
  notify: (n: {
    title: string;
    body: string;
    at?: number;
    chatId?: number;
  }) => void;
};

type KotysContextValue = {
  rpc: RouterClient<AppRouter>;
  socket: ReturnType<typeof setClients>;
  platform: Platform;
};

const KotysContext = createContext<KotysContextValue | null>(null);

interface IKotysProviderProps {
  config: KotysConfig;
  platform: Platform;
  children: ReactNode;
}

export function KotysProvider({
  config,
  platform,
  children,
}: IKotysProviderProps) {
  const value = useMemoOnce<KotysContextValue>(() => {
    const socket = setClients(config);
    return { rpc: getRpc(), socket, platform };
  });
  return (
    <KotysContext.Provider value={value}>{children}</KotysContext.Provider>
  );
}

export function useKotys(): KotysContextValue {
  const ctx = useContext(KotysContext);
  if (!ctx) throw new Error("useKotys must be used inside <KotysProvider>");
  return ctx;
}

export const useRpc = () => useKotys().rpc;
export const useSocket = () => useKotys().socket;
export const usePlatform = () => useKotys().platform;
