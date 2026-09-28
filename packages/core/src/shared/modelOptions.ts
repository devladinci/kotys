import type { ModelListing } from "@kotys/contracts";
import { modelRefName, modelRefSetting, providerOf } from "./useAppStore.js";

export interface IModelOption {
  key: string;
  label: string;
}

export const audioModelOption = (model: ModelListing): IModelOption => ({
  key: modelRefSetting(model.provider ?? "omlx", model.name),
  label: model.name,
});

export const audioModelChoice = (
  setting: string | null,
): IModelOption | null =>
  setting ? { key: setting, label: modelRefName(setting) ?? setting } : null;

const whereItRuns = (model: ModelListing): string =>
  providerOf(model) === "ollama" ? model.source : providerOf(model);

export const chatModelOption = (model: ModelListing): IModelOption => ({
  key: `${providerOf(model)}:${model.source}:${model.name}`,
  label: `${model.name} (${whereItRuns(model)})`,
});
