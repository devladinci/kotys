import type { InputRequest } from "@kotys/contracts";

/**
 * A form belongs to the chat whose turn asked for it. Requests from before
 * the chat id was carried have none, and still show anywhere.
 */
export function isInputForChat(
  request: InputRequest | null,
  chatId: number | null,
): boolean {
  if (!request) return false;
  if (request.chatId === undefined || request.chatId === null) return true;
  return request.chatId === chatId;
}
