import { useState } from "react";
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
import { Spinner } from "@/components/ui/spinner";
import { describeError } from "@/components/write/write-helpers";
import { notifySuccess } from "@/app/notify";
import { usePedalName, useDevice, useProfile } from "@/state/device";
import { editPrst } from "@/state/preset-codec";
import { emptyName, useLibrary } from "./store";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/** Rename on the pedal: name only, the sound is unchanged. Keeps the known body's chain in step. */
async function renameOnPedal(slot: number, name: string) {
  await useDevice.getState().rename(slot, name);
  const body = useLibrary.getState().bodies[slot];
  if (body) useLibrary.setState({ bodies: { ...useLibrary.getState().bodies, [slot]: { ...body, prst: editPrst(body.prst, { name }) } } });
}

export function RenameConfirmDialog({ request, onClose }: { request: { slot: number; name: string } | null; onClose(): void }) {
  const names = useDevice((s) => s.names);
  const pedal = usePedalName();
  const { slotLabel } = useProfile();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!request) return null;
  const { slot, name } = request;
  const old = names[slot]?.name ?? emptyName();

  const confirm = async () => {
    setRunning(true);
    setError(null);
    try {
      await renameOnPedal(slot, name);
      notifySuccess(t`Slot ${slotLabel(slot)} renamed to ${name}`, undefined, { label: t`Undo`, run: () => renameOnPedal(slot, old) });
      onClose();
    } catch (e) {
      setError(describeError(e, slot));
    } finally {
      setRunning(false);
    }
  };

  return (
    <AlertDialog
      open
      onOpenChange={(o) => {
        if (!o && !running) {
          setError(null);
          onClose();
        }
      }}
    >
      <AlertDialogContent className="max-w-[440px]">
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Rename slot {slotLabel(slot)} to {name}?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>The {pedal} stores the new name for {old}. Only the name changes; the sound stays the same.</Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-pretty text-led-fault">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost" disabled={running}>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <Button disabled={running} onClick={() => void confirm()}>
            {running && <Spinner data-icon="inline-start" />}
            {running ? t`Renaming` : t`Rename on pedal`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
