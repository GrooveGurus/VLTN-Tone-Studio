import { host } from "@/host";
import { SystemBluetoothControls } from "./SystemBluetoothControls";
import { Button } from "@/components/ui/button";
import { connectBluetooth, stopBluetoothReconnect, useBluetooth, type BleMidiConnection } from "./connection";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

export function BluetoothControls({
  editor = false,
  onConnected,
  locked = false,
  onSetupOpening,
  onSystemReady,
}: {
  editor?: boolean;
  onConnected?: (connection: BleMidiConnection) => void;
  locked?: boolean;
  onSetupOpening?: () => void;
  onSystemReady?: () => Promise<unknown> | void;
}) {
  const { connection, connecting, error, diagnostics, reconnect } = useBluetooth();
  return (
    <div className="flex max-w-xl flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {host.bluetoothMidi ? (
          <SystemBluetoothControls locked={locked} onOpening={onSetupOpening} onReady={onSystemReady} />
        ) : !connection && reconnect ? (
          <>
            <span role="status"><Trans>Reconnecting… (attempt {reconnect.attempt})</Trans></span>
            <Button variant="outline" onClick={() => stopBluetoothReconnect()}>
              <Trans>Stop reconnecting</Trans>
            </Button>
          </>
        ) : !connection ? (
          <Button
            variant="outline"
            disabled={connecting || locked}
            onClick={() =>
              void connectBluetooth()
                .then((connection) => onConnected?.(connection))
                .catch(() => {})
            }
          >
            {connecting ? t`Selecting Bluetooth device…` : t`Connect Bluetooth MIDI`}
          </Button>
        ) : (
          <>
            <span><Trans>Bluetooth: {connection.name}</Trans></span>
            <Button variant="outline" onClick={() => connection.close()}>
              <Trans>Disconnect Bluetooth</Trans>
            </Button>
          </>
        )}
      </div>
      {editor && (
        <p className="text-silkscreen-3">
          <Trans>Bluetooth MIDI is available for performance controls. Connect by USB to manage and edit the pedal; Bluetooth editor management is disabled.</Trans>
        </p>
      )}
      {diagnostics?.clockTiming && (
        <details className="text-silkscreen-3">
          <summary><Trans>Bluetooth clock timing</Trans></summary>
          <p>
            <Trans>{diagnostics.clockTiming.pulses} pulses · maximum dispatch delay {diagnostics.clockTiming.maxLateMs.toFixed(1)} ms · maximum write{" "}
            {diagnostics.clockTiming.maxWriteMs.toFixed(1)} ms · write intervals {diagnostics.clockTiming.minIntervalMs.toFixed(1)}–
            {diagnostics.clockTiming.maxIntervalMs.toFixed(1)} ms</Trans>
          </p>
        </details>
      )}
      {diagnostics && (diagnostics.dropped > 0 || diagnostics.reconnects > 0) && (
        <p className="text-silkscreen-3">
          <Trans>{diagnostics.dropped} late message</Trans>{diagnostics.dropped === 1 ? "" : "s"} <Trans>dropped · {diagnostics.reconnects} automatic reconnect</Trans>
          {diagnostics.reconnects === 1 ? "" : "s"}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
