import { useContext } from "react";
import { ReadAloudContext, type IReadAloud } from "./readAloudContext";

export function useReadAloud(): IReadAloud {
  const readAloud = useContext(ReadAloudContext);
  if (!readAloud) {
    throw new Error("useReadAloud must be used inside <ReadAloudProvider>");
  }

  return readAloud;
}
