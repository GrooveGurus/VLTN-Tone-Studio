import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useDevice, useProfile } from "@/state/device";
import type { Step } from "./plans";
import { emptyName, isEmptyName } from "./store";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

export interface SlotPick {
  title: string;
  description: string;
  confirmLabel: (slot: number) => string;
  /** Pre-selected target */
  initial: number | null;
  /** Steps the choice would write (null = not possible from there, e.g. past the last slot) */
  preview: (target: number) => Step[] | null;
  /** Content name for "blank"/file sources in the preview */
  sourceName?: (from: Step["from"]) => string;
  onPick(slot: number): void;
}

/** Choose a target slot and preview what changes before the confirmation dialog. */
export function SlotPickerDialog({ pick, onOpenChange }: { pick: SlotPick | null; onOpenChange(open: boolean): void }) {
  const names = useDevice((s) => s.names);
  const { slotCount, slotLabel } = useProfile();
  const [target, setTarget] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTarget(pick?.initial ?? null);
    if (pick?.initial != null) requestAnimationFrame(() => listRef.current?.querySelector(`[data-slot-pick="${pick.initial}"]`)?.scrollIntoView({ block: "center" }));
  }, [pick]);

  if (!pick) return null;
  const nameOf = (slot: number) => names[slot]?.name ?? emptyName();
  const steps = target === null ? null : pick.preview(target);
  const label = (from: Step["from"]) => (typeof from === "number" ? `${slotLabel(from)} ${nameOf(from)}` : (pick.sourceName?.(from) ?? "Empty preset"));

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(640px,calc(100vh-64px))] max-w-[520px] flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{pick.title}</DialogTitle>
          <DialogDescription>{pick.description}</DialogDescription>
        </DialogHeader>
        <div
          ref={listRef}
          role="listbox"
          aria-label={t`Target slot`}
          className="grid min-h-0 flex-1 grid-cols-2 gap-0.5 overflow-auto rounded-lg bg-well p-1.5"
        >
          {Array.from({ length: slotCount }, (_, slot) => {
            const empty = isEmptyName(nameOf(slot));
            const possible = pick.preview(slot) !== null;
            return (
              <button
                key={slot}
                type="button"
                role="option"
                aria-selected={target === slot}
                data-slot-pick={slot}
                disabled={!possible}
                onClick={() => setTarget(slot)}
                onDoubleClick={() => possible && pick.onPick(slot)}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-sm px-2.5 text-left text-sm hover:bg-accent disabled:opacity-40",
                  target === slot && "bg-lamp-glow shadow-[inset_0_0_0_1.5px_var(--lamp)] hover:bg-lamp-glow",
                )}
              >
                <span className="min-w-5 text-xs font-semibold text-silkscreen-3 tabular-nums">{slotLabel(slot)}</span>
                <span className={cn("truncate", empty ? "text-silkscreen-4" : "font-semibold text-silkscreen")}>{empty ? t`Empty` : nameOf(slot)}</span>
              </button>
            );
          })}
        </div>
        <div className="min-h-[52px] text-sm" aria-live="polite">
          {steps === null ? (
            <p className="text-silkscreen-3">{target === null ? t`Choose a slot.` : t`That runs past slot ${slotLabel(slotCount - 1)}. Choose an earlier slot.`}</p>
          ) : steps.length === 0 ? (
            <p className="text-silkscreen-3"><Trans>Nothing changes from there. Choose another slot.</Trans></p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {steps.slice(0, 4).map((s) => (
                <li key={s.slot} className="truncate text-silkscreen-2">
                  <Trans><span className="text-silkscreen-3 tabular-nums">Slot {slotLabel(s.slot)}:</span> {label(s.from)}</Trans>
                  {!isEmptyName(nameOf(s.slot)) && <span className="text-silkscreen-3"> <Trans>(was {nameOf(s.slot)})</Trans></span>}
                </li>
              ))}
              {steps.length > 4 && <li className="text-silkscreen-3"><Trans>and</Trans> {steps.length - 4} <Trans>more slots</Trans></li>}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            <Trans>Cancel</Trans>
          </Button>
          <Button disabled={target === null || !steps?.length} onClick={() => target !== null && pick.onPick(target)}>
            {target === null ? t`Choose a slot` : pick.confirmLabel(target)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
