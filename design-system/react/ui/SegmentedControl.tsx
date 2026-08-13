import { cn } from "./cn";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T;
  options: Array<SegmentOption<T>>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div aria-label={label} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-container-high p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "min-h-10 shrink-0 rounded-lg px-3 text-xs font-bold transition-colors sm:px-4",
            value === option.value
              ? "bg-surface-container-lowest text-primary shadow-sm"
              : "text-on-surface-variant hover:bg-surface-container-low"
          )}
        >
          {option.label}
          {option.count !== undefined && <span className="ml-1 opacity-70">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}
