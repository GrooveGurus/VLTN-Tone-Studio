import { useShallow } from "zustand/react/shallow";
import { CircleCheck, LoaderCircle, RefreshCw, TriangleAlert, Unlink, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifyError } from "@/app/notify";
import { cn } from "@/lib/utils";
import { DEVICE_KEYS, profileFor } from "@shared/devices";
import { pedalOnUsb, runningPortHolder } from "@shared/host/device";
import { useDevice } from "@/state/device";
import { attachedDevice, pedalName, slotLabel, vendorApps } from "@/state/device-model";
import { BluetoothControls } from "@/bluetooth/BluetoothControls";
import { bluetoothOffered } from "@/bluetooth/availability";
import { clock, pedalModelName, requestErrorLine, type ConnectionView, type Led } from "./guidance";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/** Models the Device screen offers to simulate (registry profiles with a simulator). */
const SIMULATED = DEVICE_KEYS.filter((k) => profileFor(k).simulator);
export const LED_CLASS: Record<Led, string> = { on: "bg-led-on", warn: "bg-led-warn", fault: "bg-led-fault", off: "bg-led-off" };

/** Device name plus its state line; owns the primary action in problem states. */
export function ConnectionHeader({ view, onShowFix }: { view: ConnectionView; onShowFix: () => void }) {
  const d = useDevice(
    useShallow((s) => ({
      status: s.status,
      mode: s.mode,
      device: s.device,
      hostStatus: s.hostStatus,
      lastError: s.lastError,
      connectedAt: s.connectedAt,
      portName: s.portName,
      mod: s.mod,
      firmware: s.firmware,
      activeSlot: s.preset?.slot ?? null,
      activeName: s.preset?.name ?? null,
      busy: s.busy,
      connect: s.connect,
      disconnect: s.disconnect,
      cancelConnect: s.cancelConnect,
      checkHost: s.checkHost,
      sync: s.sync,
    })),
  );
  const connected = d.status === "connected";
  const onUsb = d.mode === "webmidi" ? pedalOnUsb(d.hostStatus) : null;
  const errorLine = connected ? requestErrorLine(d.lastError) : null;

  const lookForPedal = () => void d.connect("webmidi").catch(() => {});
  const checkAgain = async () => {
    await d.checkHost();
    lookForPedal();
  };
  const readAgain = () => void d.sync().catch((e) => notifyError(t`Couldn't read the pedal`, e));

  return (
    // The actions wrap under the title when both don't fit on one line (five simulators, a long state line).
    <header className="flex flex-wrap items-end gap-x-6 gap-y-4 px-7 pt-[22px] pb-1.5">
      <div className="min-w-0 flex-[1_1_440px]">
        <h1 className="text-[32px] leading-[1.1] font-bold tracking-[-0.02em] text-balance"><Trans>Valeton {pedalModelName(d)}</Trans></h1>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-[18px] gap-y-1.5 text-sm text-silkscreen-3">
          <span className="flex items-center gap-1.5">
            {view.kind === "connecting" ? (
              <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <span className={cn("size-[7px] shrink-0 rounded-full", LED_CLASS[view.led])} aria-hidden />
            )}
            <span className="font-semibold text-silkscreen">{view.state}</span>
            {view.detail}
            {connected && d.connectedAt && <b className="font-semibold text-silkscreen">{clock(d.connectedAt)}</b>}
          </span>
          {onUsb && (
            <span>
              USB <b className="font-semibold text-silkscreen">84EF:{profileFor(onUsb).usbPids[0].toString(16).toUpperCase().padStart(4, "0")}</b>
            </span>
          )}
          {connected && d.mod && (
            <span>
              <Trans>Firmware{" "}</Trans>
              <b className="font-semibold text-silkscreen">
                {d.mod.label}
                {d.firmware ? ` · V${d.firmware}` : ""}
              </b>
            </span>
          )}
          {(connected || view.kind === "connecting") && d.portName && (
            <span>
              <Trans>MIDI port</Trans> <b className="font-semibold text-silkscreen">{d.portName}</b>
            </span>
          )}
          {connected && d.activeSlot !== null && (
            <span>
              <Trans>Active preset{" "}</Trans>
              <b className="font-semibold text-silkscreen">
                {slotLabel(d.device, d.activeSlot)} {d.activeName}
              </b>
            </span>
          )}
          {view.kind === "driver" && d.hostStatus?.driver && (
            <span>
              <Trans>Driver</Trans> <b className="font-semibold text-silkscreen">{d.hostStatus.driver}</b>
            </span>
          )}
          {connected && d.mode === "webmidi" && d.hostStatus?.vendorApps && runningPortHolder(d.hostStatus, d.device) === null && (
            <span className="flex items-center gap-1.5">
              <CircleCheck className="size-3.5" aria-hidden />
              <Trans>{vendorApps(d.device).editor} is not running</Trans>
            </span>
          )}
        </div>
        {view.note && <p className="mt-2.5 max-w-[640px] text-pretty text-silkscreen-2">{view.note}</p>}
        {view.steps.length > 0 && view.kind !== "driver" && (
          <ol className="mt-2 flex max-w-[640px] list-decimal flex-col gap-1 pl-[18px] text-silkscreen-2 marker:font-semibold marker:text-silkscreen-3">
            {view.steps.map((s) => (
              <li key={s} className="select-text">
                {s}
              </li>
            ))}
          </ol>
        )}
        {errorLine && (
          <p role="alert" className="mt-2.5 flex items-center gap-2 text-sm text-silkscreen-2">
            <TriangleAlert className="size-4 text-led-warn" aria-hidden />
            {errorLine}
            <Button variant="ghost" size="sm" onClick={readAgain} disabled={!!d.busy}>
              <RefreshCw aria-hidden />
              <Trans>Retry</Trans>
            </Button>
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 pb-0.5">
        {bluetoothOffered(attachedDevice(d)) && <BluetoothControls editor />}
        {connected ? (
          <>
            <Button variant="ghost" onClick={readAgain} disabled={!!d.busy}>
              <RefreshCw className={cn(d.busy?.kind === "sync" && "animate-spin motion-reduce:animate-none")} aria-hidden />
              <Trans>Read pedal again</Trans>
            </Button>
            <Button variant="outline" onClick={() => void d.disconnect()} disabled={!!d.busy && d.busy.kind !== "sync"}>
              <Unlink aria-hidden />
              <Trans>Disconnect</Trans>
            </Button>
          </>
        ) : (
          <>
            {view.kind !== "bootloader" && view.kind !== "connecting" && (
              <div role="group" aria-label={t`Simulate a pedal`} className="flex flex-wrap items-center gap-1">
                <Trans><span className="mr-1 text-sm text-silkscreen-3">Simulate</span></Trans>
                {SIMULATED.map((key) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={view.action === "none" ? "outline" : "ghost"}
                    aria-label={t`Simulate a ${pedalName(key)}`}
                    onClick={() => void d.connect("mock", { mockDevice: key }).catch(() => {})}
                  >
                    {pedalName(key)}
                  </Button>
                ))}
              </div>
            )}
            {view.action === "cancel" && (
              <Button variant="ghost" onClick={() => void d.cancelConnect()}>
                <Trans>Cancel</Trans>
              </Button>
            )}
            {view.action === "connect" && (
              <Button onClick={lookForPedal}>
                <RefreshCw aria-hidden />
                {view.actionLabel}
              </Button>
            )}
            {view.action === "check" && (
              <Button onClick={() => void checkAgain()}>
                <RefreshCw aria-hidden />
                {view.actionLabel}
              </Button>
            )}
            {view.action === "show-fix" && (
              <Button onClick={onShowFix}>
                <Wrench aria-hidden />
                {view.actionLabel}
              </Button>
            )}
          </>
        )}
      </div>
    </header>
  );
}
