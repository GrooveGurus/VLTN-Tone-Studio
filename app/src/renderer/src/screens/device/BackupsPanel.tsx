import { useEffect, useState } from "react";
import { FolderOpen, HardDriveDownload, Import, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { notifyError } from "@/app/notify";
import { host, isElectron } from "@/host";
import { useDevice, useProfile } from "@/state/device";
import { runBackupNow } from "@/screens/library/backup-now";
import { useLibrary } from "@/screens/library/store";
import type { CollectionInfo } from "@shared/host/files";
import { listNames } from "@shared/devices";
import { SUPPORTED_DEVICE_KEYS } from "@/state/driver/types";
import { restoreEntries, type RestoreSource } from "./restore";
import { RestoreDialog } from "./RestoreDialog";
import { useAppSettings } from "./settings-store";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

const dirOf = (c: CollectionInfo) => c.id.slice(c.id.indexOf("/") + 1);

/** "Today", "Yesterday", "3 Oct 2026" */
function madeLabel(iso: string, long = false): string {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: long ? "long" : "short", year: "numeric" });
  const rel = diff === 0 ? "Today" : diff === 1 ? "Yesterday" : null;
  return long ? (rel ? `${rel}, ${date}` : date) : (rel ?? date);
}

/** Backups card: last full backup, Back up now, before-write switch, backup table, restore entry points. */
export function BackupsPanel({ offline }: { offline: boolean }) {
  const collections = useLibrary((s) => s.collections);
  const refreshCollections = useLibrary((s) => s.refreshCollections);
  const busy = useDevice((s) => s.busy);
  const { slotCount, backupSeconds } = useProfile();
  const backupBeforeWrite = useAppSettings((s) => s.settings.backupBeforeWrite);
  const patchSettings = useAppSettings((s) => s.patch);
  const [restore, setRestore] = useState<RestoreSource | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    void refreshCollections().catch(() => {});
  }, [refreshCollections]);

  const device = useDevice((s) => s.device);
  const backups = collections.filter((c) => c.kind === "backup");
  // "Last full backup" means the last one of this pedal's model; the table lists both models.
  const last = backups.find((c) => !device || c.device === device);
  const backingUp = busy?.kind === "backup";
  const blocked = offline || !!busy;

  const openBackup = async (c: CollectionInfo) => {
    if (c.incomplete) {
      notifyError(t`This backup can't be restored`, new Error(t`It stopped before every preset was copied. Make a new backup instead.`));
      return;
    }
    setLoading(c.id);
    try {
      const presets = await host.files.listPresets(c.id);
      const { entries, converted, skipped } = restoreEntries(
        presets.map((p) => ({ fileName: p.fileName, slot: p.slot, bytes: p.prst })),
        useDevice.getState().device,
      );
      setRestore({ title: dirOf(c), location: c.path ?? c.id, entries, converted, skipped });
    } catch (e) {
      notifyError(t`Couldn't read the backup`, e);
    } finally {
      setLoading(null);
    }
  };

  const openFolder = async () => {
    try {
      const picked = await host.files.pickPrstFolder();
      if (!picked) return;
      const { entries, converted, skipped } = restoreEntries(picked.files, useDevice.getState().device);
      if (!entries.length) {
        notifyError(t`Nothing to restore`, new Error(t`${picked.name} has no ${listNames(SUPPORTED_DEVICE_KEYS)} presets with a slot number (NN-Name.prst).`));
        return;
      }
      setRestore({ title: picked.name, location: picked.path ?? picked.name, entries, converted, skipped });
    } catch (e) {
      notifyError(t`Couldn't read the folder`, e);
    }
  };

  return (
    <section aria-labelledby="bk-title" className="flex min-w-0 flex-col gap-4 rounded-lg bg-card px-5 pt-4 pb-5 shadow-[0_0_0_1px_var(--seam)]">
      <div>
        <h2 id="bk-title" className="text-[15px] font-[650] text-balance">
          <Trans>Backups</Trans>
        </h2>
        <p className="mt-0.5 text-sm text-pretty text-silkscreen-3"><Trans>A full backup copies all {slotCount} preset slots from the pedal into .prst files on this computer.</Trans></p>
      </div>

      <div className="flex items-end gap-4 border-b pt-1 pb-4">
        <div className="min-w-0">
          {last ? (
            <>
              <div className="text-sm text-silkscreen-3"><Trans>Last full backup</Trans></div>
              <div className="text-lg leading-tight font-semibold">{madeLabel(last.createdAt, true)}</div>
              <div className="text-sm text-silkscreen-3">
                <Trans>{last.count} presets in <b className="font-[550] whitespace-nowrap text-silkscreen-2">backups/{dirOf(last)}</b></Trans>
              </div>
            </>
          ) : (
            <>
              <div className="text-lg leading-tight font-semibold"><Trans>No backups yet</Trans></div>
              <div className="text-sm text-silkscreen-3"><Trans>Back up before big changes, so you can always go back.</Trans></div>
            </>
          )}
        </div>
        <div className="ml-auto flex shrink-0 flex-col items-end gap-1.5">
          {backingUp ? (
            <div className="flex w-[220px] flex-col gap-1.5" aria-live="polite">
              <Progress value={Math.round((busy?.progress ?? 0) * 100)} aria-label={busy?.label} />
              <span className="text-xs text-silkscreen-2">{busy?.label}</span>
            </div>
          ) : (
            <Button variant={offline ? "secondary" : "default"} disabled={blocked} onClick={() => void runBackupNow()}>
              <HardDriveDownload aria-hidden />
              <Trans>Back up now</Trans>
            </Button>
          )}
          <Trans><span className="text-xs text-silkscreen-3">Takes about {backupSeconds} seconds</span></Trans>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <Switch
          id="bk-auto"
          checked={backupBeforeWrite}
          onCheckedChange={(v) => void patchSettings({ backupBeforeWrite: v }).catch((e) => notifyError(t`Couldn't save the setting`, e))}
          aria-labelledby="bk-auto-label"
          className="mt-px"
        />
        <div>
          <Trans><b id="bk-auto-label" className="block font-semibold">
            Back up before every write
          </b>
          <span className="block text-sm text-pretty text-silkscreen-3">Before the app saves, renames or writes a slot, it copies what is in that slot now into Replaced presets in the Library.</span></Trans>
        </div>
      </div>

      {backups.length > 0 && (
        <div className="max-h-[220px] overflow-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-0 text-xs font-medium tracking-[0.04em] text-silkscreen-3 uppercase"><Trans>Backup</Trans></TableHead>
                <TableHead className="text-xs font-medium tracking-[0.04em] text-silkscreen-3 uppercase"><Trans>Made</Trans></TableHead>
                <TableHead className="text-right text-xs font-medium tracking-[0.04em] text-silkscreen-3 uppercase"><Trans>Presets</Trans></TableHead>
                <TableHead className="pr-0">
                  <Trans><span className="sr-only">Actions</span></Trans>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-0 font-semibold text-silkscreen">{dirOf(c)}</TableCell>
                  <TableCell className="text-silkscreen-2">{madeLabel(c.createdAt)}</TableCell>
                  <TableCell className="text-right text-silkscreen-2">{c.count}</TableCell>
                  <TableCell className="pr-0 text-right">
                    <Button variant="destructive" size="sm" disabled={blocked || loading !== null} onClick={() => void openBackup(c)}>
                      <RotateCcw aria-hidden />
                      <Trans>Restore to pedal</Trans>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {isElectron && (
          <Button variant="ghost" size="sm" onClick={() => void host.files.openBackupsFolder().catch((e) => notifyError(t`Couldn't open the backups folder`, e))}>
            <FolderOpen aria-hidden />
            <Trans>Open backups folder</Trans>
          </Button>
        )}
        <Button variant="destructive" size="sm" disabled={blocked} onClick={() => void openFolder()}>
          <Import aria-hidden />
          <Trans>Restore from another folder</Trans>
        </Button>
        <Trans><span className="ml-auto text-xs text-pretty text-silkscreen-3">Before-write copies are in Library › Replaced presets.</span></Trans>
      </div>

      <RestoreDialog source={restore} onOpenChange={(open) => !open && setRestore(null)} />
    </section>
  );
}
