import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { notifyError, notifySuccess } from "@/app/notify";
import { host } from "@/host";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/**
 * Settings > Library: the v1 copy kept when the song library moved to compressed audio. It is the way back to the old library, so it stays
 * until the user removes it. The section is shown only while the copy exists.
 */
export function OldLibraryCopy() {
  const library = host.song.library;
  const [bytes, setBytes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (library) void library.v1BackupBytes().then(setBytes, () => setBytes(null));
  }, [library]);
  if (!library || bytes === null) return null;
  const remove = async () => {
    setBusy(true);
    try {
      await library.removeV1Backup();
      setBytes(null);
      notifySuccess(t`The old library copy is in the Trash`);
    } catch (e) {
      notifyError(t`Couldn't remove the old library copy`, e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h2 className="mb-2.5 text-sm font-semibold text-silkscreen-2"><Trans>Library</Trans></h2>
      <div className="rounded-lg bg-card shadow-[0_0_0_1px_var(--seam)]">
        <div className="grid grid-cols-[280px_minmax(0,1fr)] items-center gap-6 px-5 py-3.5">
          <div>
            <Trans><b className="block font-semibold">Old library copy</b>
            <span className="block text-sm text-pretty text-silkscreen-3">
              Kept from before your songs moved to compressed audio, so you can go back to the old library. It is not needed to play your songs. To go back,
              see the README.txt in the folder.
            </span></Trans>
          </div>
          <div>
            <Button variant="outline" disabled={busy} onClick={() => void remove()}>
              <Trans>Remove the old library copy ({Math.round(bytes / 1_000_000)} MB)</Trans>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
