import { createContext } from "react";

const StreamingContext = createContext(false);

export const StreamingProvider = StreamingContext.Provider;
export { StreamingContext };
