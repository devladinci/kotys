import type { ModelListing } from "@kotys/contracts";
import { getChatById, refreshModels } from "@kotys/db";
import { events } from "../events.js";
import type { LlmConnector } from "../llm/types.js";

export const DESCRIBE_TIMEOUT_MS = 2_000;

const describeWithin = async (
  connector: LlmConnector,
  modelName: string,
): Promise<ModelListing | null> => {
  if (!connector.describeModel) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), DESCRIBE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([connector.describeModel(modelName), timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

// The stored window drives compaction, the tool-loop guard and every client's
// meter, but an oMLX user can change the real one at any time, and the model
// list (the only other refresh) loads once per app launch.
export async function syncModelWindow(
  connector: LlmConnector,
  modelName: string,
  chatId: number | null,
): Promise<void> {
  const fresh = await describeWithin(connector, modelName);
  if (!fresh) return;
  const storedWindow = () =>
    chatId === null ? undefined : getChatById(chatId)?.model_context_length;
  const before = storedWindow();
  refreshModels([fresh]);
  if (chatId === null || storedWindow() === before) return;
  events.emitEvent("chats:changed", { chatId });
}
