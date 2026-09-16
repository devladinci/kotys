import { SkillMessage } from "@kotys/core";
import MarkdownBody from "./MarkdownBody";

interface IProps {
  content: string;
}

export function UserMessageBody({ content }: IProps) {
  return (
    <MarkdownBody
      content={SkillMessage.fromContent(content)?.displayContent ?? content}
    />
  );
}
