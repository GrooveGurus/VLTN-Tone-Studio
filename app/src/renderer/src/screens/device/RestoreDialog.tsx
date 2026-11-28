import { useEffect, useId, useRef, useState } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { describeError, notifySuccess } from "@/app/notify";
import { host } from "@/host";
import { usePedalName, useDevice, useProfile } from "@/state/device";
import { pedalName } from "@/state/device-model";
import { RestoreError, type BackupEntry } from "@/state/device-types";
import { runBackupNow } from "@/screens/library/backup-now";
import { isEmptyName } from "@/screens/library/store";
import { alreadyMatchesCopy, describeSlots, type RestoreSource } from "./restore";
import { classifySlots, isChangedState } from "./compare";
import { CompareList } from "./CompareList";
import { useAppSettings } from "./settings-store";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

type Failure = { message: string; done: number[]; failed: number | null; notStarted: number[] };

/**
 * Restore AlertDialog: names the source, which slots are replaced and what is in them now, then compares each slot with
 * the pedal (a full backup first, or a read when that's off) and writes either the changed slots or all of them, slot by
 * slot with read-back verification.
 */
export function RestoreDialog({ source, onOpenChange }: { source: RestoreSource | null; onOpenChange: (open: boolean) => void }) {
  const names = useDevice((s) => s.names);
  const busy = useDevice((s) => s.busy);
  const unsaved = useDevice((s) => s.unsavedChanges);
  const device = useDevice((s) => s.device);
  const connected = useDevice((s) => s.status === "connected");
  const pedal = usePedalName();
  const { slotCount, slotLabel, backupSeconds } = useProfile();
  const backupDefault = useAppSettings((s) => s.settings.backupBeforeWrite);
  const [backupFirst, setBackupFirst] = useState(backupDefault);
  const [phase, setPhase] = useState<"confirm" | "backup" | "read" | "restore">("confirm");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [pending, setPending] = useState<RestoreSource["entries"] | null>(null);
  // What the pedal holds now, read by the backup step or a read of its own; null until one of them finishes.
  const [pedalEntries, setPedalEntries] = useState<BackupEntry[] | null>(null);
  const [onlyChanged, setOnlyChanged] = useState(true);
  const abort = useRef<AbortController | null>(null);
  const checkId = useId();

  useEffect(() => {
    if (!source) return;
    setBackupFirst(backupDefault);
    setPhase("confirm");
    setFailure(null);
    setReadError(null);
    setPending(source.entries);
    setPedalEntries(null);
    setOnlyChanged(true);
    // With the backup switched off, read the pedal on open so the list can show what differs. Unsaved changes wait
    // for the user: reading would discard them.
    if (!backupDefault && connected && unsaved === 0) void readPedal(false);
  }, [source, backupDefault]);

  if (!source) return null;
  const entries = pending ?? source.entries;
  const compare = device && pedalEntries ? classifySlots(entries, pedalEntries, device) : null;
  const states = new Map(compare?.map((c) => [c.slot, c.state]));
  const writeList = compare && onlyChanged ? entries.filter((e) => isChangedState(states.get(e.slot) ?? "different")) : entries;
  const slots = writeList.map((e) => e.slot);
  const all = slots.length === slotCount;
  const used = slots.filter((s) => !isEmptyName(names[s]?.name)).length;
  const running = phase !== "confirm";
  const count = `${slots.length} ${slots.length === 1 ? "slot" : "slots"}`;
  const inList = new Set(entries.map((e) => e.slot));
  const converted = source.converted.filter((c) => inList.has(c.slot));
  const lossy = converted.filter((c) => c.dropped.length > 0);
  // Every slot already matches the backup, so "Write only changed slots" has nothing to write.
  const nothingToWrite = compare !== null && onlyChanged && !slots.length;
  const matched = alreadyMatchesCopy(pedal);
  const replacedText = all
    ? t`Every preset on the ${pedal} is replaced with the copy in this backup.`
    : t`${describeSlots(slots, slotLabel)} on the ${pedal} are replaced with the copies in this folder.`;

  // Reads the pedal: a full backup first when `withBackup`, else a read of every slot. The result becomes the comparison.
  async function readPedal(withBackup: boolean) {
    setFailure(null);
    setReadError(null);
    const d = useDevice.getState();
    try {
      if (d.unsavedChanges > 0) await d.discard();
      if (withBackup) {
        setPhase("backup");
        const saved = await runBackupNow();
        if (!saved) {
          setPhase("confirm");
          return;
        }
        setPedalEntries(saved.entries);
      } else {
        setPhase("read");
        setPedalEntries(await d.backupAll({ onProgress: (f) => void host.app.setProgress(f).catch(() => {}) }));
      }
      setPhase("confirm");
    } catch (e) {
      setReadError(describeError(e));
      setPhase("confirm");
    } finally {
      void host.app.setProgress(null).catch(() => {});
    }
  }

  const write = async (list: RestoreSource["entries"]) => {
    setFailure(null);
    const d = useDevice.getState();
    try {
      if (d.unsavedChanges > 0) await d.discard();
      setPhase("restore");
      abort.current = new AbortController();
      await d.restoreAll(list, {
        signal: abort.current.signal,
        onProgress: (done, total) => void host.app.setProgress(done / total).catch(() => {}),
      });
      const countText = list.length === 1 ? t`1 slot` : t`${list.length} slots`;
      const slotText = describeSlots(list.map((e) => e.slot), slotLabel);
      notifySuccess(t`${countText} restored`, t`${slotText} now hold the presets from ${source.title}. Each slot was checked by reading it back.`);
      onOpenChange(false);
    } catch (e) {
      if (e instanceof RestoreError) setFailure({ message: e.failed === null ? e.message : describeError(e.cause), done: e.done, failed: e.failed, notStarted: e.notStarted });
      else setFailure({ message: describeError(e), done: [], failed: null, notStarted: list.map((e) => e.slot) });
      setPhase("confirm");
    } finally {
      abort.current = null;
      void host.app.setProgress(null).catch(() => {});
    }
  };

  const retryFrom = () => {
    if (!failure) return;
    const rest = new Set([...(failure.failed === null ? [] : [failure.failed]), ...failure.notStarted]);
    const list = entries.filter((e) => rest.has(e.slot));
    setPending(list);
    void write(list);
  };

  const label = phase === "backup" ? (busy?.label ?? t`Backing up the pedal`) : phase === "read" ? (busy?.label ?? t`Reading the pedal`) : (busy?.label ?? t`Restoring`);
  const progress = Math.round((busy?.progress ?? 0) * 100);

  return (
    <AlertDialog open onOpenChange={(open) => !running && onOpenChange(open)}>
      <AlertDialogContent className="sm:max-w-[560px]">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {nothingToWrite ? (
              matched.title
            ) : (
              <>
                {all ? t`Restore all ${slotCount} slots` : t`Restore ${count}`} <Trans>from {source.title}?</Trans>
              </>
            )}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {nothingToWrite ? matched.description : t`${replacedText} Presets you changed since then are lost unless you back them up first.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-lg bg-well px-3.5 py-3 text-sm">
          <dt className="text-silkscreen-3"><Trans>From</Trans></dt>
          <dd className="truncate text-silkscreen" title={source.location}>
            {source.location}, {entries.length} {entries.length === 1 ? t`preset` : t`presets`}
          </dd>
          {!nothingToWrite && (
            <>
              <dt className="text-silkscreen-3"><Trans>Replaces</Trans></dt>
              <dd className="text-silkscreen">
                <Trans>{describeSlots(slots, slotLabel)} on the pedal, now {used}</Trans> {used === 1 ? t`preset` : t`presets`} <Trans>and{" "}</Trans>
                {slots.length - used} <Trans>empty</Trans> {slots.length - used === 1 ? t`slot` : t`slots`}
              </dd>
              <dt className="text-silkscreen-3"><Trans>Checks</Trans></dt>
              <dd className="text-silkscreen"><Trans>Each slot is read back after writing. Keep the pedal connected until it finishes.</Trans></dd>
            </>
          )}
          {source.skipped.length > 0 && (
            <>
              <dt className="text-silkscreen-3"><Trans>Skipped</Trans></dt>
              <dd className="max-h-20 overflow-auto text-silkscreen-2">
                {source.skipped.map((s) => (
                  <div key={s}>{s}</div>
                ))}
              </dd>
            </>
          )}
          {converted.length > 0 && (
            <>
              <dt className="text-silkscreen-3"><Trans>Converted</Trans></dt>
              <dd className="max-h-24 overflow-auto text-silkscreen-2">
                <div className="text-pretty">
                  {converted.length === 1 ? t`1 preset was` : t`${converted.length} presets were`} <Trans>made on a {pedalName(converted[0].from)} and</Trans> {converted.length === 1 ? t`is` : t`are`} <Trans>converted
                  for your {pedal}.</Trans>{lossy.length > 0 ? t` These blocks have no equivalent and are left empty:` : ""}
                </div>
                {lossy.map((c) => (
                  <div key={c.slot}>
                    <Trans>Slot {slotLabel(c.slot)} {c.name}: {c.dropped.join(", ")}</Trans>
                  </div>
                ))}
              </dd>
            </>
          )}
        </dl>

        {unsaved > 0 && !running && (
          <p className="text-sm text-pretty text-silkscreen-2">
            <Trans>The Rig has {unsaved} unsaved</Trans> {unsaved === 1 ? t`change` : t`changes`}<Trans>. Restoring discards</Trans> {unsaved === 1 ? t`it` : t`them`} <Trans>first.</Trans>
          </p>
        )}

        {compare && device && (
          <div className="flex flex-col gap-2">
            <div role="group" aria-label={t`What to write`} className="flex flex-wrap gap-2">
              <Button size="sm" variant={onlyChanged ? "secondary" : "ghost"} aria-pressed={onlyChanged} disabled={running} onClick={() => setOnlyChanged(true)}>
                <Trans>Write only changed slots</Trans>
              </Button>
              <Button size="sm" variant={onlyChanged ? "ghost" : "secondary"} aria-pressed={!onlyChanged} disabled={running} onClick={() => setOnlyChanged(false)}>
                <Trans>Write all</Trans>
              </Button>
            </div>
            <CompareList rows={compare} source={entries} pedal={pedalEntries ?? []} device={device} slotLabel={slotLabel} />
          </div>
        )}

        {!failure && !pedalEntries && (
          <div className="flex items-start gap-2.5">
            <Checkbox id={checkId} checked={backupFirst} disabled={running} onCheckedChange={(v) => setBackupFirst(v === true)} className="mt-px" />
            <Label htmlFor={checkId} className="flex flex-col items-start gap-0.5 text-sm">
              <Trans><b className="font-semibold">Back up the pedal first</b>
              <span className="font-normal text-silkscreen-3">
                Saves what is on the pedal now to a new folder, then compares it with this backup. Takes about {backupSeconds} seconds.
              </span></Trans>
            </Label>
          </div>
        )}

        {running && (
          <div className="flex flex-col gap-2" aria-live="polite">
            <Progress value={progress} aria-label={label} />
            <span className="text-sm text-silkscreen-2">{label}</span>
          </div>
        )}

        {readError && !running && (
          <div role="alert" className="flex flex-col gap-1 rounded-lg bg-well px-3.5 py-3 text-sm">
            <Trans><b className="font-semibold text-silkscreen">The pedal couldn't be read</b></Trans>
            <span className="text-pretty text-silkscreen-2">{readError}</span>
          </div>
        )}

        {failure && (
          <div role="alert" className="flex flex-col gap-1 rounded-lg bg-well px-3.5 py-3 text-sm">
            <b className="font-semibold text-silkscreen">{failure.failed === null ? t`The restore stopped` : t`Slot ${slotLabel(failure.failed)} failed after 3 attempts`}</b>
            <span className="text-pretty text-silkscreen-2">{failure.message}</span>
            <span className="text-silkscreen-3"><Trans>Done:</Trans> {failure.done.length ? describeSlots(failure.done, slotLabel) : t`none`}</span>
            <span className="text-silkscreen-3"><Trans>Not started:</Trans> {failure.notStarted.length ? describeSlots(failure.notStarted, slotLabel) : t`none`}</span>
          </div>
        )}

        <AlertDialogFooter>
          {running && phase === "restore" ? (
            <Button variant="ghost" onClick={() => abort.current?.abort()}>
              <Trans>Stop after this slot</Trans>
            </Button>
          ) : (
            <AlertDialogCancel disabled={running}>{failure || nothingToWrite ? t`Close` : t`Cancel`}</AlertDialogCancel>
          )}
          {failure ? (
            (failure.failed !== null || failure.notStarted.length > 0) && (
              <Button variant="destructive" disabled={!connected || running} onClick={retryFrom}>
                <RefreshCw aria-hidden />
                <Trans>Retry from slot {slotLabel(failure.failed ?? failure.notStarted[0])}</Trans>
              </Button>
            )
          ) : !pedalEntries ? (
            <Button variant="secondary" disabled={!connected || running || !entries.length} onClick={() => void readPedal(backupFirst)}>
              {backupFirst ? t`Back up and compare` : t`Read the pedal and compare`}
            </Button>
          ) : nothingToWrite ? null : (
            <Button variant="destructive" disabled={!connected || running || !slots.length} onClick={() => void write(writeList)}>
              <RotateCcw aria-hidden />
              <Trans>Restore {count}</Trans>
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
