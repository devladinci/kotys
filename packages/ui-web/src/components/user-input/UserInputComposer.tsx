import { memo } from "react";
import { useUserInput } from "@kotys/core";
import { UserInputForm } from "./UserInputForm";

/**
 * Inline form that takes the composer's place while an input request is
 * pending. Renders nothing otherwise — ChatView swaps it for the Composer.
 */
function UserInputComposerComponent() {
  const { pending, submit, cancel } = useUserInput();
  if (!pending) return null;
  return (
    <div className="bg-surface rounded-xl border border-accent p-4">
      <UserInputForm request={pending} onSubmit={submit} onCancel={cancel} />
    </div>
  );
}

export default memo(UserInputComposerComponent);
