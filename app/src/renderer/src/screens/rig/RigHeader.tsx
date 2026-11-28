import { useState } from "react";
import { profileFor } from "@shared/devices";
import { CheckIcon, ChevronDownIcon, EllipsisIcon, GitCompareArrowsIcon, Redo2Icon, SaveIcon, Undo2Icon, XIcon } from "lucide-react";
import { keyLabel } from "@/app/keys";
import { notifyError, notifySuccess, notifyWriteDone } from "@/app/notify";
import { ConfirmWriteDialog } from "@/components/write/ConfirmWriteDialog";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { host } from "@/host";
import { useDevice, usePedalName } from "@/state/device";
import type { PresetState } from "@/state/device-types";
import { slotNameError } from "@/state/device-model";
import { useScenes } from "@/state/scenes";
import { useCommand } from "@/state/ui";
import { playPreset, redo, undo } from "./edits";
import { ExpControl } from "./ExpControl";
import { FootswitchControl } from "./FootswitchControl";
import { PatchPanel } from "./PatchPanel";
import { SceneSaveSplit, ScenesControl, SceneTitle } from "./Scenes";
import { TempoControl } from "./TempoControl";
import { Tuner } from "./Tuner";
import { VariationMenu } from "./Variation";
import { useHistory } from "./history";
import { useRig } from "./rig-store";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

interface Props {
  preset: PresetState;
  connected: boolean;
}

/**
 * Preset name, unsaved count, tempo, footswitches (CTRL), EXP (GP-50) or patch settings (GP-200 family); undo/redo,
 * Compare with saved, Discard, Save split button.
 */
export function RigHeader({ preset, connected }: Props) {
  const saved = useDevice((s) => s.saved);
  const unsaved = useDevice((s) => s.unsavedChanges);
  const busy = useDevice((s) => s.busy);
  const names = useDevice((s) => s.names);
  const pedal = usePedalName();
  const profile = profileFor(preset.device);
  const canUndo = useHistory((s) => s.past.length > 0);
  const canRedo = useHistory((s) => s.future.length > 0);
  const compare = useRig((s) => s.compare);
  const comparing = useRig((s) => s.comparing);
  const [target, setTarget] = useState<number | null>(null);
  const [slotPicker, setSlotPicker] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const scenes = useDevice((s) => s.features.includes("modScenes"));
  const sceneEditing = useScenes((s) => s.editing !== null);

  const live = connected && !busy;
  const editable = live && !compare && !comparing;
  /** Saving or renaming the preset would store the scene being edited as the base: finish the scene first. */
  const savable = editable && !sceneEditing;
  const shownChanges = compare ? compare.changes : unsaved;

  const toggleCompare = async () => {
    const rig = useRig.getState();
    const d = useDevice.getState();
    if (rig.comparing || !d.preset || !d.saved) return;
    useRig.setState({ comparing: true });
    try {
      if (rig.compare) {
        await playPreset(rig.compare.edited);
        useRig.setState({ compare: null });
      } else {
        useRig.setState({ compare: { edited: d.preset, changes: d.unsavedChanges } });
        await playPreset(d.saved);
      }
    } catch (e) {
      notifyError(t`Couldn't compare with the saved preset`, e);
    } finally {
      useRig.setState({ comparing: false });
    }
  };

  const discard = async () => {
    try {
      useRig.setState({ compare: null });
      if (useScenes.getState().editing !== null) return void (await useScenes.getState().leave());
      await useDevice.getState().discard();
      useHistory.getState().clear();
    } catch (e) {
      notifyError(t`Couldn't discard the changes`, e, discard);
    }
  };

  const exportPrst = async () => {
    try {
      const where = await host.files.exportPresets([{ fileName: `${profile.slotLabel(preset.slot)}-${preset.name.trim() || "Preset"}.prst`, prst: preset.prst }]);
      if (where) notifySuccess(t`Exported ${preset.name}`, where);
    } catch (e) {
      notifyError(t`Couldn't export the preset`, e);
    }
  };

  const saveTarget = (slot: number) => {
    if (!savable) return;
    setTarget(slot);
  };

  // Registered whenever the Rig can act (not only when there is something to do): an unhandled command is
  // queued by the shell and would fire later.
  useCommand("undo", () => void undo(), editable);
  useCommand("redo", () => void redo(), editable);
  useCommand("compare-with-saved", () => void ((useDevice.getState().unsavedChanges > 0 || useRig.getState().compare) && toggleCompare()), live);
  useCommand("discard-changes", () => void ((useDevice.getState().unsavedChanges > 0 || useRig.getState().compare) && discard()), live);
  useCommand("save-to-slot", () => saveTarget(preset.slot), savable);
  useCommand("rename-slot", () => setRenaming(true), savable);

  const writeTitle =
    target === null
      ? ""
      : target === preset.slot
        ? t`Overwrite ${saved?.name ?? preset.name} in slot ${profile.slotLabel(target)}?`
        : t`Write ${preset.name} to slot ${profile.slotLabel(target)}?`;
  const replacingName = target === null ? "" : target === preset.slot ? (saved?.name ?? preset.name) : (names[target]?.name ?? "");

  return (
    // Two rows: the title beside the actions, then the preset's info across the whole width (it wraps rather than run
    // under the buttons when a narrow window or a longer language leaves no room).
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-7 pt-4 pb-3 max-[1320px]:gap-x-4 [@media(max-height:820px)]:pt-2.5 [@media(max-height:820px)]:pb-2">
        <div className="flex min-w-0 items-center gap-5">
          {renaming ? (
            <RenameField preset={preset} onDone={() => setRenaming(false)} />
          ) : (
            <h1
              className={cn("m-0 min-w-0 truncate text-[32px] leading-[1.05] font-bold tracking-[-0.02em]", !connected && "text-silkscreen-2")}
              onDoubleClick={() => savable && setRenaming(true)}
            >
              <span className="mr-3 font-semibold text-silkscreen-4">{profile.slotLabel(preset.slot)}</span>
              {preset.name}
              {scenes && <SceneTitle preset={preset} />}
            </h1>
          )}
        </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <IconTip label={t`Undo`} keys={["Mod", "Z"]}>
          <Button variant="ghost" size="icon-sm" aria-label={t`Undo`} disabled={!editable || !canUndo} onClick={() => void undo()}>
            <Undo2Icon aria-hidden />
          </Button>
        </IconTip>
        <IconTip label={t`Redo`} keys={["Mod", "Shift", "Z"]}>
          <Button variant="ghost" size="icon-sm" aria-label={t`Redo`} disabled={!editable || !canRedo} onClick={() => void redo()}>
            <Redo2Icon aria-hidden />
          </Button>
        </IconTip>
        <Tuner />
        {scenes && <ScenesControl preset={preset} disabled={!editable} />}
        <VariationMenu preset={preset} disabled={!editable} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              aria-label={t`Compare with saved`}
              aria-pressed={!!compare}
              disabled={!live || comparing || (!compare && unsaved === 0)}
              onClick={() => void toggleCompare()}
              className={cn("max-[1320px]:w-[34px] max-[1320px]:px-0", compare && "bg-silkscreen text-lamp-ink hover:bg-silkscreen/90")}
            >
              <GitCompareArrowsIcon aria-hidden />
              <span className="max-[1320px]:hidden">{compare ? t`Back to your edits` : t`Compare with saved`}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="min-[1321px]:hidden">{compare ? t`Back to your edits` : t`Compare with saved`}</TooltipContent>
        </Tooltip>
        <Button variant="ghost" className="max-[1320px]:hidden" disabled={!live || (unsaved === 0 && !compare)} onClick={() => void discard()}>
          <Trans>Discard</Trans>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t`More actions`} className="min-[1321px]:hidden">
              <EllipsisIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!live || (unsaved === 0 && !compare)} onSelect={() => void discard()}>
              <Trans>Discard changes</Trans>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {sceneEditing ? (
          <SceneSaveSplit preset={preset} disabled={!editable} />
        ) : (
          <div className="flex">
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={connected ? -1 : 0}>
                <Button disabled={!savable} onClick={() => saveTarget(preset.slot)} className="rounded-r-none pr-3">
                  <SaveIcon aria-hidden />
                  {busy?.kind === "write" ? t`Writing ${Math.round(busy.progress * 100)}%` : t`Save to slot ${profile.slotLabel(preset.slot)}`}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {!connected ? t`Connect the ${pedal} to save` : compare ? t`Go back to your edits to save` : keyLabel(["Mod", "S"])}
            </TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label={t`More save options`} className="rounded-l-none border-l border-black/15 px-2.5">
                <ChevronDownIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem disabled={!savable} onSelect={() => saveTarget(preset.slot)}>
                <Trans>Save to slot {profile.slotLabel(preset.slot)}</Trans>
                <DropdownMenuShortcut>{keyLabel(["Mod", "S"])}</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!savable} onSelect={() => setSlotPicker(true)}>
                <Trans>Save to another slot…</Trans>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!savable} onSelect={() => setRenaming(true)}>
                <Trans>Rename on pedal…</Trans>
                <DropdownMenuShortcut>F2</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void exportPrst()}><Trans>Export .prst…</Trans></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        )}
      </div>
      <div className="col-span-2 flex flex-wrap items-center gap-x-[18px] gap-y-1.5 text-sm whitespace-nowrap text-silkscreen-3 max-[1320px]:gap-x-3.5">
        {shownChanges > 0 ? (
          <span className="flex items-center gap-1.5 font-semibold text-silkscreen">
            <span className="size-1.5 rounded-full bg-led-warn" aria-hidden />
            {shownChanges === 1 ? t`1 unsaved change` : t`${shownChanges} unsaved changes`}
            {compare && <span className="font-normal text-silkscreen-3"><Trans>· playing the saved version</Trans></span>}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-silkscreen-4" aria-hidden />
            <Trans>No unsaved changes</Trans>
          </span>
        )}
        <TempoControl bpm={preset.bpm} range={profile.tempo} disabled={!editable} />
        <FootswitchControl preset={preset} disabled={!editable} />
        {preset.exp && <ExpControl preset={preset} exp={preset.exp} disabled={!editable} />}
        {preset.gp200 && <PatchPanel preset={preset} fields={preset.gp200} disabled={!editable} />}
      </div>

      <CommandDialog open={slotPicker} onOpenChange={setSlotPicker} title={t`Save to another slot`} description={t`Pick the slot to write this preset to`}>
        <CommandInput placeholder={t`Find a slot by number or name`} />
        <CommandList className="max-h-[360px]">
          <CommandEmpty><Trans>No slot matches</Trans></CommandEmpty>
          <CommandGroup heading={t`${pedal} slots`}>
            {names.map((n) => (
              <CommandItem
                key={n.slot}
                value={`${profile.slotLabel(n.slot)} ${n.name}`}
                disabled={n.slot === preset.slot}
                onSelect={() => {
                  setSlotPicker(false);
                  saveTarget(n.slot);
                }}
              >
                <span className="min-w-6 shrink-0 font-semibold whitespace-nowrap text-silkscreen-3 tabular-nums">{profile.slotLabel(n.slot)}</span>
                <span className="flex-1 truncate">{n.name}</span>
                {n.slot === preset.slot && <span className="text-xs text-silkscreen-3"><Trans>This preset</Trans></span>}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {target !== null && (
        <ConfirmWriteDialog
          open
          onOpenChange={(o) => !o && setTarget(null)}
          title={writeTitle}
          slot={target}
          replacing={replacingName.trim() ? { name: replacingName, detail: target === preset.slot ? t`Saved version of ${replacingName}` : undefined } : null}
          incoming={{ name: preset.name, detail: unsaved > 0 ? (unsaved === 1 ? t`As edited now, including 1 unsaved change` : t`As edited now, including ${unsaved} unsaved changes`) : t`As shown on the Rig`, prst: preset.prst }}
          action={t`Write to slot ${profile.slotLabel(target)}`}
          onConfirm={async ({ backupFirst }) => {
            const slot = target;
            await useDevice.getState().saveToSlot(slot);
            useHistory.getState().clear();
            notifyWriteDone({ name: preset.name, slot, backedUp: backupFirst });
          }}
        />
      )}
    </div>
  );
}

function IconTip({ label, keys, children }: { label: string; keys: string[]; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>
        {label} <span className="text-silkscreen-3">{keyLabel(keys)}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/** Inline rename with a character counter (the model's name length); commits on the pedal immediately. */
function RenameField({ preset, onDone }: { preset: PresetState; onDone(): void }) {
  const [value, setValue] = useState(preset.name.trimEnd());
  const [busy, setBusy] = useState(false);
  const pedal = usePedalName();
  const profile = profileFor(preset.device);
  const nameLength = profile.nameLength;
  const trimmed = value.trimEnd();
  const error = slotNameError(value, pedal);
  const atLimit = value.length >= nameLength;
  const slot = preset.slot;
  const before = preset.name;

  const commit = async () => {
    if (error || busy) return;
    if (trimmed === before.trimEnd()) return onDone();
    setBusy(true);
    try {
      await useDevice.getState().rename(slot, trimmed);
      notifySuccess(t`Slot ${profile.slotLabel(slot)} renamed to ${trimmed}`, undefined, {
        label: t`Undo`,
        run: () => useDevice.getState().rename(slot, before.trimEnd()),
      });
      onDone();
    } catch (e) {
      notifyError(t`Couldn't rename slot ${profile.slotLabel(slot)}`, e);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[32px] leading-[1.05] font-semibold text-silkscreen-4">{profile.slotLabel(slot)}</span>
        <input
          autoFocus
          aria-label={t`Name of slot ${profile.slotLabel(slot)}`}
          aria-invalid={!!error}
          value={value}
          maxLength={nameLength}
          disabled={busy}
          onChange={(e) => setValue(e.currentTarget.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") void commit();
            if (e.key === "Escape") onDone();
          }}
          onBlur={(e) => {
            if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) onDone();
          }}
          className={cn(
            "h-10 max-w-[40vw] rounded-sm bg-well px-3 text-[26px] font-bold text-silkscreen shadow-[inset_0_0_0_1px_var(--glass-edge)] outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--silkscreen)]",
            error && "shadow-[inset_0_0_0_1.5px_var(--led-fault)] focus-visible:shadow-[inset_0_0_0_1.5px_var(--led-fault)]",
          )}
          // room for the longest name in wide letters (W ≈ 1.05em at this weight) plus the padding
          style={{ width: `calc(${nameLength * 1.1}em + 24px)` }}
        />
        <span className={cn("text-xs tabular-nums", atLimit ? "text-led-warn" : "text-silkscreen-3")}>
          {value.length}/{nameLength}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label={t`Rename on pedal`} disabled={!!error || busy} onClick={() => void commit()}>
          <CheckIcon aria-hidden />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={t`Cancel rename`} onClick={onDone}>
          <XIcon aria-hidden />
        </Button>
      </div>
      <span role={error ? "alert" : undefined} className={cn("text-xs", error ? "text-led-fault" : "text-led-warn")}>
        {error ?? (atLimit ? t`The ${pedal} stores ${nameLength} characters. Further typing is ignored.` : "")}
      </span>
    </div>
  );
}
