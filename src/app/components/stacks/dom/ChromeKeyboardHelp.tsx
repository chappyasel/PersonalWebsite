import { Keycap } from "~/components/ui/keycap";

const labelClassName =
  "stacks-on-background-text whitespace-nowrap rounded-sm font-serif text-base tracking-tight text-foreground min-[1200px]:text-lg";

export default function ChromeKeyboardHelp({
  open,
  onOpen,
  tapFirst,
  fieldNotes,
}: {
  open: boolean;
  onOpen: () => void;
  tapFirst: boolean;
  fieldNotes: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-0.5">
        {tapFirst ? (
          <span className={labelClassName}>Chappy Asel</span>
        ) : (
          <button
            type="button"
            aria-label="Open keyboard shortcuts"
            aria-controls="stacks-keyboard-shortcuts"
            aria-expanded={open}
            onClick={onOpen}
            className={`${labelClassName} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60`}
          >
            Chappy Asel
          </button>
        )}
        {fieldNotes}
      </div>
      {!tapFirst && (
        <div className="stacks-wordmark-shortcuts stacks-on-background-text mt-1 flex items-center gap-1.5 whitespace-nowrap font-serif text-[10px] tracking-[0.01em]">
          <button
            type="button"
            aria-label="Open keyboard shortcuts"
            aria-controls="stacks-keyboard-shortcuts"
            aria-expanded={open}
            onClick={onOpen}
            className="flex items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <Keycap aria-hidden="true">?</Keycap>
            <span>Shortcuts</span>
          </button>
        </div>
      )}
    </div>
  );
}
