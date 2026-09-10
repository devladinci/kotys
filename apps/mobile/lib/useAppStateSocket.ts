import { useEffect } from "react";
import { AppState } from "react-native";
import { useSocket } from "@kotys/core";

/**
 * iOS suspends the socket when the app backgrounds. On return, wake() reconnects
 * immediately and KotysSocket replays every frame past the last seq it saw — so
 * a reply that finished generating while you were in another app is still there.
 */
export function useAppStateSocket() {
  const socket = useSocket();
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") socket.wake();
    });
    return () => sub.remove();
  }, [socket]);
}
