import { useEffect } from "react";
import { shouldShowNotification, useSocket, usePlatform } from "@kotys/core";

export function useNotifications(): void {
  const socket = useSocket();
  const platform = usePlatform();

  useEffect(() => {
    return socket.on((msg) => {
      if (msg.type !== "notify") return;
      const { title, body, chatId } = msg.payload;
      const isVisible = document.visibilityState === "visible";
      if (
        !shouldShowNotification(
          { chatId },
          { isVisible, hasFocus: document.hasFocus() },
        )
      ) {
        return;
      }
      platform.notify({ title, body, chatId });
    });
  }, [socket, platform]);
}
