import { os } from "@orpc/server";

export type ApiContext = {
  clientId: string | null;
};

export const pub = os.$context<ApiContext>();
