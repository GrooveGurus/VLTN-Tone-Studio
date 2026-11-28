import { useState } from "react";
import { toast } from "sonner";
import { CircleCheck, CircleX, Info, LoaderCircle, RefreshCw, TriangleAlert, X } from "lucide-react";
import { PedalNotice } from "@/components/pedal/PedalNotice";
import { Button } from "@/components/ui/button";
import { host } from "@/host";
import { cn } from "@/lib/utils";
import { useDevice } from "@/state/device";
import { pedalName, profileOrDefault, slotLabel } from "@/state/device-model";
import { modErrorNotice, type PedalNoticeSpec } from "@/state/pedal-notices";
import { t } from "@lingui/core/macro";

/** "GP-5" / "GP-50" for the connected (or last connected) pedal, "pedal" before the first connection. */
const currentPedal = () => pedalName(useDevice.getState().device);

/*
 * Toasts (Sonner, bottom right above the status bar, max 3, newest on top).
 * Success toasts auto-dismiss after 6 s; errors stay until dismissed and offer Retry when a retry is possible.
 * Every screen reports pedal results through these helpers so the copy stays the same everywhere.
 */

interface ToastAction {
  label: string;
  /** Errors thrown here keep the toast open; resolving dismisses it */
  run: () => void | Promise<void>;
  /** Show "Retrying" with a spinner while `run` is in flight */
  retry?: boolean;
}

interface ToastSpec {
  /** "info": something to do, not a result (no success or failure colour); "warn": refused for now, fixable */
  tone: "ok" | "fault" | "info" | "warn";
  title: string;
  body?: string;
  action?: ToastAction;
  /** Keep an "ok" or "info" toast until dismissed (it asks for a decision) */
  sticky?: boolean;
  /** What the pedal said (state/pedal-notices): drawn by PedalNotice in place of the title and body */
  notice?: PedalNoticeSpec;
}

const TONE_ICON = {
  ok: { Icon: CircleCheck, color: "text-led-on" },
  fault: { Icon: CircleX, color: "text-led-fault" },
  info: { Icon: Info, color: "text-silkscreen-2" },
  warn: { Icon: TriangleAlert, color: "text-led-warn" },
} as const;

function ToastCard({ id, spec }: { id: string | number; spec: ToastSpec }) {
  const [running, setRunning] = useState(false);
  const { tone, title, body, action, notice } = spec;
  const { Icon, color } = TONE_ICON[tone];
  const onAction = async () => {
    if (!action) return;
    setRunning(true);
    try {
      await action.run();
      toast.dismiss(id);
    } catch {
      // the action reports its own failure (usually with a fresh toast)
      toast.dismiss(id);
    }
  };
  const actionButton = action && (
    <Button variant="outline" size="sm" className={notice ? undefined : "self-center"} disabled={running} onClick={onAction}>
      {running && action.retry ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : action.retry ? <RefreshCw aria-hidden /> : null}
      {running && action.retry ? t`Retrying` : action.label}
    </Button>
  );
  return (
    <div
      role={notice ? undefined : tone === "fault" || tone === "warn" ? "alert" : "status"}
      aria-busy={running || undefined}
      className="glass-float relative flex w-[404px] max-w-[calc(100vw-48px)] items-start gap-2.5 rounded-lg py-3.5 pr-10 pl-3.5 text-[13px] text-silkscreen"
    >
      {notice ? (
        <PedalNotice notice={notice} variant="toast" className="min-w-0 flex-1" actions={actionButton} />
      ) : (
        <>
          <Icon className={cn("mt-px size-[18px] shrink-0", color)} aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <b className="font-semibold">{title}</b>
            {body && <span className="text-xs text-pretty text-silkscreen-2">{body}</span>}
          </div>
        </>
      )}
      {!notice && actionButton}
      <button
        type="button"
        aria-label={t`Dismiss`}
        onClick={() => toast.dismiss(id)}
        className="absolute top-2 right-2 grid size-6 place-items-center rounded-[10px] text-silkscreen-3 before:absolute before:-inset-1 before:content-[''] hover:bg-accent hover:text-silkscreen"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

export function showToast(spec: ToastSpec): string | number {
  const lasting = spec.tone === "fault" || spec.tone === "warn" || spec.sticky;
  return toast.custom((id) => <ToastCard id={id} spec={spec} />, { duration: lasting ? Infinity : 6000 });
}

/** Device/toolkit error → one plain sentence . */
export function describeError(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  switch (e?.code) {
    case "timeout":
      return t`No reply from the ${currentPedal()} after 3 tries. Check the USB cable.`;
    case "verify":
      return t`The read-back differs from what was sent.`;
    case "closed":
      return t`The ${currentPedal()} disconnected before it finished.`;
    case "length":
    case "unsafe":
      return t`Tone Studio stopped this write because the data looked wrong. Nothing was sent.`;
    default:
      return e?.message || String(error);
  }
}

export function notifyError(title: string, error: unknown, retry?: () => void | Promise<void>): void {
  // The mod's statuses and a silent pedal get the notice with what to do on the pedal; the rest stays one sentence.
  const notice = modErrorNotice(error, title, useDevice.getState().device);
  if (notice) return void notifyPedal(notice, notice.retryable && retry ? retry : undefined);
  showToast({ tone: "fault", title, body: describeError(error), action: retry ? { label: t`Retry`, run: retry, retry: true } : undefined });
}

/** What the pedal said (a mod status, a change made on the pedal) as a toast; `retry` adds Retry. */
export function notifyPedal(notice: PedalNoticeSpec, retry?: () => void | Promise<void>): string | number {
  return showToast({ tone: notice.tone, title: notice.title, body: notice.body, notice, action: retry ? { label: t`Retry`, run: retry, retry: true } : undefined });
}

export function notifySuccess(title: string, body?: string, action?: ToastAction): void {
  showToast({ tone: "ok", title, body, action });
}

/** A3: a verified write. `go` selects the written slot (omit when it is already active). */
export function notifyWriteDone({ name, slot, backedUp, go }: { name: string; slot: number; backedUp: boolean; go?: () => void | Promise<void> }): void {
  const nn = slotLabel(useDevice.getState().device, slot);
  showToast({
    tone: "ok",
    title: t`${name} is now in slot ${nn}`,
    body: backedUp ? t`Verified by reading it back. The old slot ${nn} is in your backups.` : t`Verified by reading it back.`,
    action: go ? { label: t`Go to slot ${nn}`, run: go } : undefined,
  });
}

/** G: a failed write. A write the pedal doesn't fully acknowledge is discarded, so the slot is unchanged. */
export function notifyWriteFailed({ slot, error, retry }: { slot: number; error: unknown; retry?: () => void | Promise<void> }): void {
  const nn = slotLabel(useDevice.getState().device, slot);
  const code = (error as { code?: string } | null)?.code;
  if (code === "verify") {
    showToast({
      tone: "fault",
      title: t`Slot ${nn} didn't match after writing`,
      body: t`The read-back differs from what was sent. Retry, or restore slot ${nn} from the backup.`,
      action: retry ? { label: t`Retry`, run: retry, retry: true } : undefined,
    });
    return;
  }
  const body =
    code === "timeout"
      ? t`The ${currentPedal()} stopped answering and discarded the write. Slot ${nn} was not changed.`
      : code === "closed"
        ? t`The ${currentPedal()} disconnected during the write and discarded it. Slot ${nn} was not changed.`
        : describeError(error);
  showToast({ tone: "fault", title: t`Couldn't write slot ${nn}`, body, action: retry ? { label: t`Retry`, run: retry, retry: true } : undefined });
}

/** G: backup finished. `path` is the backup folder on disk (desktop app). */
export function notifyBackupDone({ folder, path, count }: { folder: string; path?: string | null; count: number }): void {
  const all = count === profileOrDefault(useDevice.getState().device).slotCount;
  showToast({
    tone: "ok",
    title: t`Backup finished`,
    body: all ? t`All ${count} slots are in the ${folder} backup folder.` : t`${count} slots are in the ${folder} backup folder.`,
    action: path && host.kind === "electron" ? { label: t`Show folder`, run: () => host.app.showItemInFolder(path) } : undefined,
  });
}
