import type { SkillListing } from "@kotys/contracts";

export interface IComposerConfig {
  onSend: (text: string, images: string[]) => void;
  getImages: () => string[];
  skills: SkillListing[];
  placeholder: string;
}

/**
 * Mutable bridge between React props and callbacks the editor captures once
 * at creation (extension items, placeholder, editorProps). Written in an
 * effect after every render, read inside editor callbacks at call time.
 */
export const composerConfig: IComposerConfig = {
  onSend: () => {},
  getImages: () => [],
  skills: [],
  placeholder: "",
};

export const setComposerConfig = (next: Partial<IComposerConfig>) => {
  Object.assign(composerConfig, next);
};