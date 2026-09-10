export default function WidgetPlaceholder({ label }: { label: string }) {
  return (
    <div className="my-2 rounded-lg border border-border bg-surface p-4 text-xs text-text-muted animate-pulse">
      {label}
    </div>
  );
}
