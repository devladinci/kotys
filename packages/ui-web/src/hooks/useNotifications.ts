import { useEffect } from "react";
import { useSocket, usePlatform } from "@kotys/core";

export function useNotifications(): void {
  const socket = useSocket();
  const platform = usePlatform();

  useEffect(() => {
    return socket.on((msg) => {
      if (msg.type === "notify") {
        platform.notify({ title: msg.payload.title, body: msg.payload.body });
      }
    });
  }, [socket, platform]);
}
