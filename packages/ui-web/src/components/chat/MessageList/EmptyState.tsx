interface IProps {
  onPickExample?: (text: string) => void;
}

const STATIC_EXAMPLES = [
  "Summarize my last conversation about the API migration.",
  "Create a todo: review the PR by Friday.",
  "Remember that I prefer TypeScript over JavaScript.",
  "What's the weather like in Lisbon right now?",
];
export function EmptyState({ onPickExample }: IProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-text-muted px-6 py-10">
      <p className="text-sm mb-4">Start the conversation, or try:</p>
      {onPickExample ? (
        <div className="grid gap-2 max-w-md w-full">
          {STATIC_EXAMPLES.map((example) => (
            <ExampleButton
              key={example}
              text={example}
              onPick={onPickExample}
            />
          ))}
        </div>
      ) : (
        <ul className="text-sm text-text-muted/80 list-disc pl-5">
          {STATIC_EXAMPLES.map((example) => (
            <li key={example}>{example}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExampleButton({
  text,
  onPick,
}: {
  text: string;
  onPick: (text: string) => void;
}) {
  const handleClick = () => onPick(text);

  return (
    <button
      onClick={handleClick}
      className="text-left text-sm px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-2 hover:border-accent transition"
    >
      {text}
    </button>
  );
}
