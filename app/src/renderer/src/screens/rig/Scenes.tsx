import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowDownToLineIcon, ChevronDownIcon, Layers2Icon, PencilIcon, PlayIcon, SaveIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { describeError, notifyError, notifySuccess, showToast } from "@/app/notify";
import { PedalNotice } from "@/components/pedal/PedalNotice";
import { modErrorNotice, type PedalNoticeSpec } from "@/state/pedal-notices";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { keyLabel } from "@/app/keys";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { defaultSceneName, type Scene } from "@/gp200/lib/mod-service.mjs";
import { useDevice, usePedalName } from "@/state/device";
import type { PresetState } from "@/state/device-types";
import { useScenes } from "@/state/scenes";
import { useCommand } from "@/state/ui";
import { SCENE_COLORS, SCENE_CTRL_SWITCHES, SCENE_LETTERS, ctrlLabel, sceneIsEmpty, sceneName, sceneNameError, sceneRows, scenesOf, type CapturedScene } from "@/state/scenes-model";
import type { ChangeRow } from "@/state/unsaved-diff";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

const letter = (k: number) => SCENE_LETTERS[k];
/** `--scene`: the scene's colour on the pedal, for the classes below. */
const sceneColor = (k: number) => ({ "--scene": SCENE_COLORS[k] }) as CSSProperties;
/** Like the pedal's screen: the scene that plays is filled with its colour, a saved one is outlined in it. */
const FILLED = "bg-[var(--scene)] text-lamp-ink";
const OUTLINED = "bg-[color-mix(in_srgb,var(--scene)_14%,transparent)] text-[var(--scene)] shadow-[inset_0_0_0_1.5px_var(--scene)]";
const EMPTY = "text-silkscreen-4 shadow-[inset_0_0_0_1px_var(--seam-strong)]";

/** After a scene save: what was stored, and what stayed out of it. */
function notifySceneSaved(k: number, { dropped, scene }: CapturedScene) {
  if (sceneIsEmpty(scene)) return notifySuccess(t`Scene ${letter(k)} is empty`, t`The Rig played the saved preset as it is, so the pedal keeps no scene there.`);
  const body = t`It stays on the Rig; on the pedal it plays when you select ${letter(k)}.`;
  if (dropped.length) showToast({ tone: "info", sticky: true, title: t`Saved scene ${letter(k)} · ${scene.name} without some changes`, body: t`A scene can't hold: ${dropped.join(", ")}. ${body}` });
  else notifySuccess(t`Saved scene ${letter(k)} · ${scene.name}`, body);
}

async function editScene(k: number) {
  try {
    await useScenes.getState().edit(k);
  } catch (e) {
    notifyError(t`Couldn't play scene ${letter(k)}`, e);
  }
}

async function leaveScene() {
  try {
    await useScenes.getState().leave();
  } catch (e) {
    notifyError(t`Couldn't go back to the base`, e);
  }
}

/**
 * Rig header "Scenes" (GP-200 running the GrooveGurus mod): the four scenes of the active preset in a side sheet, what
 * each changes from the saved preset, and the actions to play one on the Rig, save the Rig's sound into one, rename or
 * delete it.
 */
export function ScenesControl({ preset, disabled }: { preset: PresetState; disabled: boolean }) {
  const current = useScenes((s) => s.current);
  const loading = useScenes((s) => s.loading);
  const error = useScenes((s) => s.error);
  const errorCause = useScenes((s) => s.errorCause);
  const device = useDevice((s) => s.device);
  const list = useScenes((s) => s.list);
  const editing = useScenes((s) => s.editing);
  const pedalState = useScenes((s) => s.pedal);
  const writing = useScenes((s) => s.writing);
  const canWrite = useDevice((s) => s.features.includes("modScenesWrite"));
  const base = useDevice((s) => s.saved);
  const unsaved = useDevice((s) => s.unsavedChanges);
  const pedal = usePedalName();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "edit" | "delete"; k: number }>(null);
  const [saving, setSaving] = useState<number | null>(null);

  const ready = current !== null && current.slot === preset.slot;
  const scenes = scenesOf(current?.record ?? null);
  const saved = scenes.filter(Boolean).length;
  const unreadable = ready && current.bytes !== null && current.record === null;
  const readOnly = disabled || !canWrite || unreadable || writing;

  const startEdit = (k: number) => {
    // Unsaved edits of the base would turn into the scene's: ask first (not when another scene is being edited).
    if (editing === null && unsaved > 0) return setConfirm({ kind: "edit", k });
    setOpen(false);
    void editScene(k);
  };
  const runConfirmed = async () => {
    if (!confirm) return;
    const { kind, k } = confirm;
    setConfirm(null);
    if (kind === "edit") {
      setOpen(false);
      await editScene(k);
    } else {
      try {
        await useScenes.getState().remove(k);
        notifySuccess(t`Deleted scene ${letter(k)}`);
      } catch (e) {
        notifyError(t`Couldn't delete scene ${letter(k)}`, e);
      }
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <SheetTrigger asChild>
              <Button variant="outline" aria-label={ready ? t`Scenes: ${saved} of 4 saved` : t`Scenes`} className="max-[1320px]:w-[34px] max-[1320px]:px-0">
                <Layers2Icon aria-hidden />
                <Trans><span className="max-[1320px]:hidden">Scenes</span></Trans>
              </Button>
            </SheetTrigger>
          </TooltipTrigger>
          <TooltipContent className="min-[1321px]:hidden"><Trans>Scenes</Trans>{ready ? t` · ${saved} of 4 saved` : ""}</TooltipContent>
        </Tooltip>
        <SheetContent side="right" className="w-[480px] gap-0 p-0 sm:max-w-[480px]">
          <SheetHeader className="border-b border-border py-5 pr-12 pl-6">
            <SheetTitle className="text-lg"><Trans>Scenes of {preset.name}</Trans></SheetTitle>
            <SheetDescription className="text-pretty text-silkscreen-3">
              <Trans>A scene is this preset as saved, plus what the scene changes. Play one here to edit it on the Rig, or save what the Rig plays now into
              one. On the {pedal}, scene mode plays them with the footswitches.</Trans>
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pt-5 pb-8">
            {!ready && (loading || !error) && (
              <p className="flex items-center gap-2 text-sm text-silkscreen-3">
                <Spinner /> <Trans>Reading the scenes from the {pedal}</Trans>
              </p>
            )}
            {error && (
              <PedalNotice
                notice={failureNotice(errorCause ?? new Error(error), t`Couldn't read the scenes`, device)}
                actions={
                  <Button size="sm" variant="outline" onClick={() => void useScenes.getState().refresh()}>
                    <Trans>Try again</Trans>
                  </Button>
                }
              />
            )}
            {unreadable && (
              <PedalNotice
                notice={{
                  tone: "warn",
                  art: "mod-update",
                  title: t`Saved by a newer mod`,
                  body: t`Tone Studio shows that these scenes exist and leaves them as they are. Update Tone Studio to edit them.`,
                  detail: current.error ?? undefined,
                }}
              />
            )}
            {ready && !unreadable && base &&
              scenes.map((scene, k) => (
                <SceneCard
                  key={k}
                  k={k}
                  scene={scene}
                  base={base}
                  editing={editing === k}
                  playing={!!pedalState?.sceneMode && pedalState.activeScene === k}
                  readOnly={readOnly}
                  canSave={!readOnly}
                  onEdit={() => startEdit(k)}
                  onSave={() => setSaving(k)}
                  onDelete={() => setConfirm({ kind: "delete", k })}
                />
              ))}
            {ready && !canWrite && <p className="text-xs text-silkscreen-3"><Trans>This version of the mod lets Tone Studio read scenes only.</Trans></p>}
            {list && (
              <p className="mt-2 text-xs text-pretty text-silkscreen-3">
                {list.total - list.free} <Trans>of {list.total} presets on the {pedal} have scenes.</Trans>
                {list.free === 0 && !scenes.some(Boolean) && t` There is no room for the scenes of another preset; delete the scenes of one first.`}
                {list.orphans > 0 && t` ${list.orphans} scene ${list.orphans === 1 ? t`record belongs` : t`records belong`} to no preset.`}
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent className="w-[480px] max-w-[calc(100vw-48px)] sm:max-w-[480px]">
          {confirm && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-lg font-semibold text-balance">
                  {confirm.kind === "edit"
                    ? t`Play scene ${letter(confirm.k)} over your unsaved changes?`
                    : t`Delete scene ${letter(confirm.k)} · ${scenes[confirm.k]?.name ?? ""}?`}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-[13px] text-pretty text-silkscreen-2">
                  {confirm.kind === "edit"
                    ? t`The ${unsaved === 1 ? t`unsaved change` : t`${unsaved} unsaved changes`} to ${preset.name} stop playing, and whatever you keep different from the saved preset goes into the scene when you save it.`
                    : t`The ${pedal} forgets this scene. The preset and the other scenes stay as they are.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel><Trans>Cancel</Trans></AlertDialogCancel>
                <Button variant={confirm.kind === "delete" ? "destructive" : "default"} onClick={() => void runConfirmed()}>
                  {confirm.kind === "edit" ? t`Play scene ${letter(confirm.k)}` : t`Delete`}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      <SaveSceneDialog preset={preset} target={saving} onClose={() => setSaving(null)} />
    </>
  );
}

interface CardProps {
  k: number;
  scene: Scene | null;
  base: PresetState;
  editing: boolean;
  playing: boolean;
  readOnly: boolean;
  canSave: boolean;
  onEdit(): void;
  onSave(): void;
  onDelete(): void;
}

function SceneCard({ k, scene, base, editing, playing, readOnly, canSave, onEdit, onSave, onDelete }: CardProps) {
  const [renaming, setRenaming] = useState(false);
  const rows = scene ? sceneRows(base, scene) : [];
  return (
    <section
      aria-label={t`Scene ${letter(k)}`}
      style={sceneColor(k)}
      className={cn("flex flex-col gap-3 rounded-lg p-3.5 shadow-[inset_0_0_0_1px_var(--seam-strong)]", editing && "shadow-[inset_0_0_0_2px_var(--scene)]")}
    >
      <div className="flex items-center gap-3">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-md text-sm font-bold", editing || playing ? FILLED : scene ? OUTLINED : EMPTY)}>
          {letter(k)}
        </span>
        <div className="min-w-0 flex-1">
          {renaming && scene ? (
            <RenameScene k={k} name={scene.name} onDone={() => setRenaming(false)} />
          ) : (
            <div className="truncate text-sm font-semibold text-silkscreen">{scene ? scene.name : t`Empty`}</div>
          )}
          <div className="text-xs text-silkscreen-3">
            {editing ? t`Playing on the Rig · edits go into this scene` : playing ? t`Playing on the pedal` : scene ? (rows.length === 1 ? t`1 change` : t`${rows.length} changes`) : t`Plays the base`}
          </div>
        </div>
        {scene && !renaming && (
          <Button variant="ghost" size="icon-sm" aria-label={t`Rename scene ${letter(k)}`} disabled={readOnly} onClick={() => setRenaming(true)}>
            <PencilIcon aria-hidden />
          </Button>
        )}
        {scene && (
          <Button variant="ghost" size="icon-sm" aria-label={t`Delete scene ${letter(k)}`} disabled={readOnly} onClick={onDelete}>
            <Trash2Icon aria-hidden />
          </Button>
        )}
      </div>
      {rows.length > 0 && <ChangesTable rows={rows} />}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={readOnly || editing} onClick={onEdit}>
          <PlayIcon aria-hidden />
          {scene ? t`Play and edit` : t`Start from the base`}
        </Button>
        <Button size="sm" variant="ghost" disabled={!canSave} onClick={onSave}>
          <SaveIcon aria-hidden />
          <Trans>Save the Rig's sound here</Trans>
        </Button>
      </div>
    </section>
  );
}

function RenameScene({ k, name, onDone }: { k: number; name: string; onDone(): void }) {
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const problem = sceneNameError(value);
  const commit = async () => {
    if (problem || saving) return;
    if (value.trim() === name) return onDone();
    setSaving(true);
    try {
      await useScenes.getState().rename(k, value);
      onDone();
    } catch (e) {
      notifyError(t`Couldn't rename scene ${letter(k)}`, e);
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <Input
        autoFocus
        aria-label={t`Name of scene ${letter(k)}`}
        aria-invalid={!!problem}
        value={value}
        maxLength={16}
        disabled={saving}
        className="h-7 text-sm"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") {
            e.stopPropagation();
            onDone();
          }
        }}
      />
      {problem && <span className="text-xs text-led-fault">{problem}</span>}
    </div>
  );
}

function ChangesTable({ rows }: { rows: ChangeRow[] }) {
  return (
    <table className="w-full text-xs tabular-nums">
      <thead>
        <tr className="border-b border-seam text-left text-silkscreen-3">
          <th className="py-1 pr-3 font-medium"><Trans>Block</Trans></th>
          <th className="py-1 pr-3 font-medium"><Trans>Parameter</Trans></th>
          <th className="py-1 pr-3 text-right font-medium"><Trans>Base</Trans></th>
          <th className="py-1 text-right font-medium"><Trans>Scene</Trans></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-seam last:border-0">
            <td className="py-1.5 pr-3">
              {r.block ? (
                <span className="flex items-center gap-1.5">
                  <span className="size-2 shrink-0 rounded-pill" style={{ background: `var(--block-${r.block.code.toLowerCase()})` }} aria-hidden />
                  <b className="font-bold text-silkscreen-2">{r.block.code}</b>
                </span>
              ) : (
                <span className="text-silkscreen-3"><Trans>Preset</Trans></span>
              )}
            </td>
            <td className="py-1.5 pr-3 text-silkscreen">{r.parameter}</td>
            <td className="py-1.5 pr-3 text-right text-silkscreen-3">{r.saved}</td>
            <td className="py-1.5 text-right font-semibold text-silkscreen">{r.now}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * In the Rig title, after the preset name in scene mode: the scene the Rig plays (edited here, or the one the pedal
 * plays), as "Preset | Scene name" in the scene's colour.
 */
export function SceneTitle({ preset }: { preset: PresetState }) {
  const mode = useScenes((s) => s.mode);
  const editing = useScenes((s) => s.editing);
  const pedalState = useScenes((s) => s.pedal);
  const current = useScenes((s) => s.current);
  const k = editing ?? (pedalState?.sceneMode ? pedalState.activeScene : null);
  if (mode !== "scene" || k === null) return null;
  const scene = current?.slot === preset.slot ? scenesOf(current.record)[k] : null;
  return (
    <>
      <Separator orientation="vertical" className="mx-4 inline-block align-middle data-[orientation=vertical]:h-[0.8em] data-[orientation=vertical]:w-0.5" />
      <span style={sceneColor(k)} className="text-[var(--scene)]">
        {scene?.name ?? defaultSceneName(k)}
      </span>
    </>
  );
}

/** The pedal's LED colours for the CTRL footswitches in scene mode (cenas 0.8.4) and the TAP footswitch. */
const LED = { on: "#ffc400", off: "#ff1f4b", tap: "#2a72ee" } as const;

/**
 * Under the Rig header while the pedal is in scene mode (or a scene is edited here): the footswitches as on the pedal.
 * Top row: BANK−, BANK+, CTRL 1 and TAP are CTRL 1-4 of the scene (TAP only with Tap Tempo Disabled), lit yellow when
 * on and red when off. Bottom row: scenes A-D; click one to play it on the Rig and edit it, click it again for the base
 * (the pedal's fifth scene). On the right: what the edits go into and Back to the base (Save is the header's button).
 */
export function SceneFootswitches({ preset, disabled }: { preset: PresetState; disabled: boolean }) {
  const current = useScenes((s) => s.current);
  const editing = useScenes((s) => s.editing);
  const pedalState = useScenes((s) => s.pedal);
  const writing = useScenes((s) => s.writing);
  const ctrlOn = useScenes((s) => s.ctrlOn);
  const tapTempo = useScenes((s) => s.tapTempo);
  const canWrite = useDevice((s) => s.features.includes("modScenesWrite"));
  const unsaved = useDevice((s) => s.unsavedChanges);
  const busy = useDevice((s) => s.busy);
  const pedal = usePedalName();
  const [confirm, setConfirm] = useState<number | null>(null);

  const mode = useScenes((s) => s.mode);
  if (mode !== "scene") return null;

  const ready = current !== null && current.slot === preset.slot;
  const scenes = scenesOf(current?.record ?? null);
  const unreadable = ready && current.bytes !== null && current.record === null;
  const readOnly = disabled || !canWrite || unreadable || writing || !!busy;
  /** What the Rig plays: the scene edited here, else the one the pedal plays; null = the base. */
  const selected = editing ?? (pedalState?.sceneMode ? pedalState.activeScene : null);
  const scene = editing === null ? null : scenes[editing];

  const pick = (k: number) => {
    if (selected === k) return void leaveScene(); // the scene that plays again: the base, like the pedal
    // Unsaved edits of the base would turn into the scene's: ask first (not when another scene is being edited).
    if (editing === null && unsaved > 0) return setConfirm(k);
    void editScene(k);
  };

  return (
    <div
      role="group"
      aria-label={t`Footswitches`}
      className="mx-7 mb-2 flex items-center gap-6 rounded-lg px-4 py-2.5 shadow-[inset_0_0_0_1px_var(--seam-strong)] max-[1320px]:gap-4 [@media(max-height:820px)]:py-1.5"
    >
      <div className="grid min-w-0 flex-1 grid-cols-4 gap-x-4 gap-y-1.5">
        {SCENE_CTRL_SWITCHES.map((sw, n) => {
          const tap = n === 3 && tapTempo !== "disabled";
          const label = tap ? null : ctrlLabel(preset, n);
          const on = !!ctrlOn[n];
          return tap ? (
            <Footswitch
              key={sw}
              caption="TAP"
              label={t`Tap tempo`}
              color={LED.tap}
              lit="dim"
              disabled
              title={t`TAP taps the tempo. It becomes CTRL 4 when the mod's Tap Tempo is set to Disabled (GLOBAL › Footswitch on the ${pedal}).`}
            />
          ) : (
            <Footswitch
              key={sw}
              caption={`${sw} · CTRL ${n + 1}`}
              label={label ?? t`No blocks`}
              color={label ? (on ? LED.on : LED.off) : undefined}
              lit={label ? "full" : "off"}
              pressed={on}
              disabled={disabled || !label}
              title={label ? t`CTRL ${n + 1} on ${sw}: ${on ? t`on` : t`off`}. Click to switch its blocks, like the footswitch.` : t`CTRL ${n + 1} has no blocks in this scene (CTRL Settings).`}
              onClick={() => useScenes.getState().toggleCtrl(n)}
            />
          );
        })}
        {SCENE_LETTERS.map((l, k) => {
          const s = scenes[k];
          const active = selected === k;
          const playing = !!pedalState?.sceneMode && pedalState.activeScene === k;
          return (
            <Footswitch
              key={l}
              caption={t`Scene ${l}${playing && editing !== k ? t` · on the pedal` : ""}`}
              label={s?.name ?? (ready ? t`Empty` : defaultSceneName(k))}
              color={SCENE_COLORS[k]}
              lit={active ? "full" : s ? "ring" : "off"}
              pressed={active}
              disabled={!ready || readOnly}
              title={active ? t`Scene ${l} plays. Click again for the base.` : s ? t`Play scene ${l} · ${s.name} and edit it` : t`Scene ${l} is empty: start it from the base`}
              onClick={() => pick(k)}
            />
          );
        })}
      </div>

      <div className="flex w-[360px] shrink-0 flex-col items-end gap-1.5 border-l border-seam pl-6 max-[1320px]:w-[280px] max-[1320px]:pl-4">
        <span role="status" className="w-full truncate text-right text-sm text-silkscreen-2">
          {editing !== null ? (
            <>
              <b className="font-semibold text-silkscreen" style={sceneColor(editing)}>
                <span className="text-[var(--scene)]">●</span> <Trans>Editing scene {letter(editing)}</Trans>
                {scene ? ` · ${scene.name}` : ""}
              </b>
              <span className="block text-xs text-silkscreen-3">
                {unsaved === 0 ? t`Plays like the saved preset so far` : unsaved === 1 ? t`1 difference from the saved preset` : t`${unsaved} differences from the saved preset`}
              </span>
            </>
          ) : (
            <>
              <b className="font-semibold text-silkscreen">{selected === null ? t`Base` : t`Scene ${letter(selected)} on the ${pedal}`}</b>
              <span className="block text-xs text-silkscreen-3"><Trans>Click a scene to play and edit it here</Trans></span>
            </>
          )}
        </span>
        {editing !== null && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={writing || !!busy} onClick={() => void leaveScene()}>
              <Undo2Icon aria-hidden />
              <Trans>Back to the base</Trans>
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent className="w-[480px] max-w-[calc(100vw-48px)] sm:max-w-[480px]">
          {confirm !== null && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-lg font-semibold text-balance"><Trans>Play scene {letter(confirm)} over your unsaved changes?</Trans></AlertDialogTitle>
                <AlertDialogDescription className="text-[13px] text-pretty text-silkscreen-2">
                  <Trans>The</Trans> {unsaved === 1 ? t`unsaved change` : t`${unsaved} unsaved changes`} <Trans>to {preset.name} stop playing, and whatever you keep different from the
                  saved preset goes into the scene when you save it.</Trans>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel><Trans>Cancel</Trans></AlertDialogCancel>
                <Button
                  onClick={() => {
                    const k = confirm;
                    setConfirm(null);
                    void editScene(k);
                  }}
                >
                  <Trans>Play scene {letter(confirm)}</Trans>
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface FootswitchProps {
  /** The footswitch on the pedal (small, above) */
  caption: string;
  /** What it does now: the CTRL's effect, the scene's name */
  label: string;
  /** LED colour; undefined = unlit grey */
  color?: string;
  /** full: lit in its colour; ring: outlined in it (a saved scene); dim: faint; off: unlit */
  lit: "full" | "ring" | "dim" | "off";
  pressed?: boolean;
  disabled?: boolean;
  title: string;
  onClick?(): void;
}

/** One footswitch: the round LED and what it does, side by side. */
function Footswitch({ caption, label, color, lit, pressed, disabled, title, onClick }: FootswitchProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={disabled ? 0 : -1} className="min-w-0 rounded-md">
          <button
            type="button"
            aria-label={`${caption}: ${label}`}
            aria-pressed={onClick ? !!pressed : undefined}
            disabled={disabled}
            onClick={onClick}
            style={{ "--led": color ?? "var(--led-off)" } as CSSProperties}
            className="group flex w-full min-w-0 items-center gap-2.5 rounded-md py-0.5 pr-1.5 text-left enabled:cursor-pointer"
          >
            <span
              aria-hidden
              className={cn(
                "size-6 shrink-0 rounded-full transition-[background-color,box-shadow,transform] duration-150 group-enabled:group-active:scale-95 motion-reduce:transition-none [@media(max-height:820px)]:size-5",
                lit === "full" && "bg-[var(--led)] shadow-[0_0_10px_color-mix(in_srgb,var(--led)_55%,transparent)]",
                lit === "ring" && "bg-[color-mix(in_srgb,var(--led)_18%,transparent)] shadow-[inset_0_0_0_2px_var(--led)]",
                lit === "dim" && "bg-[color-mix(in_srgb,var(--led)_35%,transparent)]",
                lit === "off" && "bg-led-off",
                "group-enabled:group-hover:ring-2 group-enabled:group-hover:ring-[color-mix(in_srgb,var(--led)_40%,transparent)]",
              )}
            />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[11px] text-silkscreen-3">{caption}</span>
              <span className={cn("block truncate text-sm font-semibold", lit === "off" || disabled ? "text-silkscreen-3" : "text-silkscreen")}>{label}</span>
            </span>
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[320px] text-pretty">{title}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The Rig header's Save split button while a scene is edited: save the Rig's sound into the scene (Mod S), rename it
 * (F2) or delete it. Replaces "Save to slot", which would store the scene as the base.
 */
export function SceneSaveSplit({ preset, disabled }: { preset: PresetState; disabled: boolean }) {
  const editing = useScenes((s) => s.editing);
  const current = useScenes((s) => s.current);
  const writing = useScenes((s) => s.writing);
  const canWrite = useDevice((s) => s.features.includes("modScenesWrite"));
  const busy = useDevice((s) => s.busy);
  const pedal = usePedalName();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [picking, setPicking] = useState(false);
  /** The scene the Save confirmation writes to, while it is open */
  const [target, setTarget] = useState<number | null>(null);
  /** A menu item opens a dialog: the menu must not take the focus back when it closes, or the dialog closes with it. */
  const opensDialog = useRef(false);
  const ready = current !== null && current.slot === preset.slot;
  const unreadable = ready && current.bytes !== null && current.record === null;
  const readOnly = disabled || !ready || !canWrite || unreadable || writing || !!busy;
  const k = editing ?? 0;
  const scenes = scenesOf(current?.record ?? null);
  const scene = scenes[k];

  useCommand("save-to-slot", () => setTarget(k), editing !== null && !readOnly);
  useCommand("rename-slot", () => setRenaming(true), editing !== null && !readOnly && !!scene);
  if (editing === null) return null;

  const remove = async () => {
    setDeleting(false);
    try {
      await useScenes.getState().remove(k);
      notifySuccess(t`Deleted scene ${letter(k)}`, t`The scene stays selected and plays the base until you save it again.`);
    } catch (e) {
      notifyError(t`Couldn't delete scene ${letter(k)}`, e);
    }
  };

  return (
    <div className="flex" style={sceneColor(k)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={readOnly ? 0 : -1}>
            <Button disabled={readOnly} onClick={() => setTarget(k)} className="rounded-r-none pr-3">
              {writing ? <Spinner /> : <SaveIcon aria-hidden />}
              {writing ? t`Saving scene ${letter(k)}` : t`Save scene ${letter(k)}`}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {unreadable ? t`These scenes were saved by a newer mod` : !canWrite ? t`This version of the mod can't write scenes` : t`What the Rig plays now goes into scene ${letter(k)} · ${keyLabel(["Mod", "S"])}`}
        </TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label={t`More scene options`} className="rounded-l-none border-l border-black/15 px-2.5">
            <ChevronDownIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56"
          onCloseAutoFocus={(e) => {
            if (opensDialog.current) e.preventDefault();
            opensDialog.current = false;
          }}
        >
          <DropdownMenuItem
            disabled={readOnly}
            onSelect={() => {
              opensDialog.current = true;
              setTarget(k);
            }}
          >
            <Trans>Save scene {letter(k)}</Trans>
            <DropdownMenuShortcut>{keyLabel(["Mod", "S"])}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={readOnly}
            onSelect={() => {
              opensDialog.current = true;
              setPicking(true);
            }}
          >
            <Trans>Save to another scene…</Trans>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={readOnly || !scene}
            onSelect={() => {
              opensDialog.current = true;
              setRenaming(true);
            }}
          >
            <Trans>Rename scene {letter(k)}…</Trans>
            <DropdownMenuShortcut>F2</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={readOnly || !scene}
            onSelect={() => {
              opensDialog.current = true;
              setDeleting(true);
            }}
          >
            <Trans>Delete scene {letter(k)}…</Trans>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CommandDialog open={picking} onOpenChange={setPicking} title={t`Save to another scene`} description={t`Pick the scene to save what the Rig plays now into`}>
        <CommandInput placeholder={t`Find a scene by letter or name`} />
        <CommandList>
          <CommandEmpty><Trans>No scene matches</Trans></CommandEmpty>
          <CommandGroup heading={t`Scenes of ${preset.name}`}>
            {scenes.map((s, i) => (
              <CommandItem
                key={i}
                value={`${letter(i)} ${s?.name ?? "Empty"}`}
                disabled={i === k}
                onSelect={() => {
                  setPicking(false);
                  setTarget(i);
                }}
              >
                <span style={sceneColor(i)} className={cn("grid size-6 shrink-0 place-items-center rounded text-xs font-bold", s ? OUTLINED : EMPTY)}>
                  {letter(i)}
                </span>
                <span className={cn("flex-1 truncate", !s && "text-silkscreen-3")}>{s?.name ?? t`Empty`}</span>
                {i === k && <span className="text-xs text-silkscreen-3"><Trans>Editing now</Trans></span>}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <SaveSceneDialog preset={preset} target={target} onClose={() => setTarget(null)} />

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle><Trans>Rename scene {letter(k)}</Trans></DialogTitle>
            <DialogDescription><Trans>The {pedal} shows it on the scene footswitch, up to 16 characters.</Trans></DialogDescription>
          </DialogHeader>
          {renaming && scene && <RenameSceneForm k={k} name={scene.name} onDone={() => setRenaming(false)} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent className="w-[480px] max-w-[calc(100vw-48px)] sm:max-w-[480px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold text-balance">
              <Trans>Delete scene {letter(k)}</Trans>
              {scene ? ` · ${scene.name}` : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] text-pretty text-silkscreen-2">
              <Trans>The {pedal} forgets this scene. The preset and the other scenes stay as they are.</Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel><Trans>Cancel</Trans></AlertDialogCancel>
            <Button variant="destructive" onClick={() => void remove()}>
              <Trans>Delete</Trans>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** The rename dialog's form: Enter or Save writes the name, Esc or Cancel leaves it (no commit on blur, unlike the card). */
function RenameSceneForm({ k, name, onDone }: { k: number; name: string; onDone(): void }) {
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const problem = sceneNameError(value);
  const submit = async () => {
    if (problem || saving) return;
    if (value.trim() === name) return onDone();
    setSaving(true);
    try {
      await useScenes.getState().rename(k, value);
      notifySuccess(t`Renamed scene ${letter(k)}`, sceneName(value, k));
      onDone();
    } catch (e) {
      notifyError(t`Couldn't rename scene ${letter(k)}`, e);
      setSaving(false);
    }
  };
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-col gap-1">
        <Input autoFocus aria-label={t`Name of scene ${letter(k)}`} aria-invalid={!!problem} value={value} maxLength={16} disabled={saving} onChange={(e) => setValue(e.target.value)} />
        <span className={cn("text-xs", problem ? "text-led-fault" : "text-silkscreen-3")}>{problem ?? t`${value.length} of 16`}</span>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={saving} onClick={onDone}>
          <Trans>Cancel</Trans>
        </Button>
        <Button type="submit" disabled={!!problem || saving}>
          {saving && <Spinner />}
          <Trans>Rename</Trans>
        </Button>
      </div>
    </form>
  );
}

/** The name a save into scene `k` starts with: the scene's own, or what the edited scene is called when saving it elsewhere. */
function suggestedName(scenes: (Scene | null)[], k: number, editing: number | null): string {
  const from = editing !== null && editing !== k ? scenes[editing] : null;
  if (from && from.name !== defaultSceneName(editing!)) return from.name;
  return scenes[k]?.name ?? defaultSceneName(k);
}

/**
 * The scene write confirmation, laid out like the preset's (ConfirmWriteDialog): what goes in, named here, what scene
 * `target` holds now, and what a scene can't hold; errors stay in place with Retry. Scenes have no backup step: the
 * preset itself is not written.
 */
function SaveSceneDialog({ preset, target, onClose }: { preset: PresetState; target: number | null; onClose(): void }) {
  const current = useScenes((s) => s.current);
  const editing = useScenes((s) => s.editing);
  const writing = useScenes((s) => s.writing);
  const connected = useDevice((s) => s.status === "connected");
  const base = useDevice((s) => s.saved);
  const pedal = usePedalName();
  const [name, setName] = useState("");
  /** Why the last try failed (shown as the pedal's notice), or null */
  const [error, setError] = useState<unknown>(null);
  const device = useDevice((s) => s.device);
  const [preview, setPreview] = useState<CapturedScene | null>(null);
  const [running, setRunning] = useState(false);
  const open = target !== null;
  const k = target ?? 0;
  const scenes = scenesOf(current?.slot === preset.slot ? current.record : null);
  const replacing = scenes[k];

  // Once per opening: the name to start from and what the Rig's sound makes of the scene.
  useEffect(() => {
    if (target === null) return;
    setError(null);
    setRunning(false);
    setName(suggestedName(scenes, target, editing));
    try {
      setPreview(useScenes.getState().capture(target));
    } catch (e) {
      setPreview(null);
      setError(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const problem = sceneNameError(name);
  const empty = preview !== null && sceneIsEmpty(preview.scene);
  const changes = preview && base ? sceneRows(base, preview.scene).length : 0;
  const sourceLetter = letter(editing ?? k);
  const from = editing === null ? t`the base` : t`scene ${sourceLetter}`;

  const confirm = async () => {
    if (problem || running) return;
    setError(null);
    setRunning(true);
    try {
      const captured = await useScenes.getState().save(k, name);
      onClose();
      notifySceneSaved(k, captured);
    } catch (e) {
      setError(e ?? new Error("Unknown error"));
      setRunning(false);
    }
  };

  const title = running
    ? t`Saving scene ${letter(k)}`
    : replacing
      ? t`Overwrite scene ${letter(k)} · ${replacing.name}?`
      : t`Save scene ${letter(k)}?`;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && !running && onClose()}>
      <AlertDialogContent className="max-w-[480px] gap-4" style={sceneColor(k)} onEscapeKeyDown={(e) => running && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-balance">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-pretty">
            {running
              ? t`Keep the ${pedal} connected until it reads the scene back.`
              : t`Scene ${letter(k)} becomes what the Rig plays now, as differences from ${base?.name ?? preset.name} as saved. The ${pedal} goes back to the base after the write, ${editing === null ? t`and the Rig plays the saved preset again` : t`then the Rig plays scene ${letter(k)} again`}.${replacing ? t` The pedal has no undo.` : ""}`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form
          id="save-scene"
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-2 rounded-lg bg-well px-3.5 py-3 text-sm">
            <dt className="pt-1.5 text-silkscreen-3"><Trans>Scene {letter(k)}</Trans></dt>
            <dd className="flex min-w-0 flex-col gap-1">
              <Input
                autoFocus
                aria-label={t`Name of scene ${letter(k)}`}
                aria-invalid={!!problem}
                value={name}
                maxLength={16}
                disabled={running}
                className="h-8 font-semibold"
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setName(e.target.value)}
              />
              <span className={cn("text-xs", problem ? "text-led-fault" : "text-silkscreen-3")}>
                {problem ?? t`Shown on the scene footswitch · ${name.length} of 16`}
              </span>
            </dd>
            <dt className="text-silkscreen-3"><Trans>From</Trans></dt>
            <dd className="min-w-0 text-silkscreen">
              <Trans>As the Rig plays {from} now</Trans>
              {preview && !empty && <span className="text-silkscreen-3">, {changes === 1 ? t`1 change` : t`${changes} changes`}</span>}
            </dd>
            <dt className="text-silkscreen-3"><Trans>Scene {letter(k)} now</Trans></dt>
            <dd className="min-w-0 text-silkscreen">
              {replacing ? (
                <>
                  <span className="font-semibold">{replacing.name}</span>
                  {base && <span className="text-silkscreen-3">, {sceneRows(base, replacing).length === 1 ? t`1 change` : t`${sceneRows(base, replacing).length} changes`}</span>}
                </>
              ) : (
                t`Empty, nothing is replaced`
              )}
            </dd>
          </dl>
        </form>

        {empty && (
          <p className="text-sm text-pretty text-silkscreen-2">
            <Trans>The Rig plays the saved preset as it is, so there is nothing to keep</Trans>{replacing ? t`: saving removes scene ${letter(k)} from the ${pedal}` : t` and scene ${letter(k)} stays empty`}.
          </p>
        )}
        {preview && preview.dropped.length > 0 && (
          <p className="text-sm text-pretty text-silkscreen-2">
            <Trans><b className="font-semibold text-silkscreen">Left out of the scene:</b> {preview.dropped.join(", ")}. The {pedal} plays the base's value there.</Trans>
          </p>
        )}

        {error != null && <PedalNotice notice={failureNotice(error, t`Couldn't save scene ${letter(k)}`, device)} />}

        <AlertDialogFooter className="items-center">
          {running ? (
            <Button disabled>
              <Spinner data-icon="inline-start" />
              <Trans>Saving</Trans>
            </Button>
          ) : (
            <>
              <AlertDialogCancel variant="ghost"><Trans>Cancel</Trans></AlertDialogCancel>
              <Button
                type="submit"
                form="save-scene"
                variant={replacing ? "destructive" : "default"}
                disabled={!connected || !preview || !!problem || writing}
              >
                <ArrowDownToLineIcon data-icon="inline-start" />
                {error != null && preview ? t`Retry` : t`Save scene ${letter(k)}`}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** A failure as the pedal's notice: the mod's own statuses and timeouts explained, anything else in one sentence. */
function failureNotice(error: unknown, failedTitle: string, device: Parameters<typeof modErrorNotice>[2]): PedalNoticeSpec {
  return modErrorNotice(error, failedTitle, device) ?? { tone: "fault", title: failedTitle, body: describeError(error) };
}
