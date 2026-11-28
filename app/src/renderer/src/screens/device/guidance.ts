// Connection state → what the Device screen, the title-bar chip and the status bar say, and how to fix it.
// Pure: every input comes from the device store and the host checks, so the mapping is unit-tested.
import { VALETON_VID, listNames, profileFor } from "@shared/devices";
import { GENERIC_DRIVER_RE, MIDI2_DRIVER_RE, pedalOnUsb, runningPortHolder, type DeviceHostStatus } from "@shared/host/device";
import type { HostApi } from "@shared/host";
import { attachedDevice, pedalName, pedalNameOrBoth, vendorAppName, vendorApps } from "@/state/device-model";
import type { ConnectionError, ConnectionStatus, DeviceKey, DeviceMode, RequestError } from "@/state/device-types";
import { SUPPORTED_DEVICE_KEYS } from "@/state/driver/types";
import { t } from "@lingui/core/macro";

export { vendorApps } from "@/state/device-model";

export type ViewKind =
  | "connected"
  | "connecting"
  | "disconnected"
  | "no-port"
  | "driver"
  | "bootloader"
  | "unsupported-model"
  | "suite"
  | "silent"
  | "wrong-device"
  | "linux-access"
  | "permission"
  | "no-sysex"
  | "unsupported"
  | "insecure"
  | "broken-browser"
  | "error";

export type Led = "on" | "warn" | "fault" | "off";
/** The header's one primary action */
export type PrimaryAction = "connect" | "show-fix" | "check" | "cancel" | "none";

export interface ConnectionView {
  kind: ViewKind;
  led: Led;
  /** Title-bar chip text after the pedal name */
  chip: string;
  /** Bold state label in the header meta row */
  state: string;
  /** Text after the state label */
  detail: string;
  /** Paragraph under the meta row; null when the state needs no explanation */
  note: string | null;
  /** Numbered fix steps, when there is something the user can do */
  steps: string[];
  action: PrimaryAction;
  actionLabel: string | null;
  /** Left side of the status bar */
  statusText: string;
  /** Pedal settings and pedal actions are unavailable */
  offline: boolean;
  /** Open the Windows 11 driver guide by itself */
  openGuide: boolean;
}

export interface GuidanceInput {
  status: ConnectionStatus;
  error: ConnectionError | null;
  mode: DeviceMode;
  hostStatus: DeviceHostStatus | null;
  platform: HostApi["platform"];
  disconnectReason?: "user" | "lost" | null;
  lastConnectedAt?: number | null;
  now?: number;
  /** Connected pedal model, else the last connected one (store `device`); null before the first connection */
  device?: DeviceKey | null;
  /** Port of the open, opening or last tried connection (store `portName`): it names the pedal before it identifies */
  portName?: string | null;
}

/** "GP-5 or GP-50" */
const SUPPORTED_EITHER = listNames(SUPPORTED_DEVICE_KEYS);

/** Pedal model for the copy (attachedDevice); unknown = every supported model. */
export function pedalModelName(input: Pick<GuidanceInput, "status" | "hostStatus" | "device" | "portName">): string {
  return pedalNameOrBoth(attachedDevice(input));
}
const pad2 = (n: number) => String(n).padStart(2, "0");

/** "13:42" */
export function clock(at: number): string {
  const d = new Date(at);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "today at 13:42", "yesterday at 09:10", "on 3 Oct at 18:00" */
export function formatWhen(at: number, now = Date.now()): string {
  const d = new Date(at);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(d)) / 86_400_000);
  const day = days === 0 ? "today" : days === 1 ? "yesterday" : `on ${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })}`;
  return `${day} at ${clock(at)}`;
}

const plugIn = (pedal: string) => t`Plug the ${pedal} into this computer with a USB data cable and switch it on.`;
const AUDIO_GROUP_STEPS = (h: DeviceHostStatus | null) => {
  const group = h?.linuxSeq?.group ?? "audio";
  return [
    t`Add yourself to the "${group}" group: run  sudo usermod -aG ${group} $USER  in a terminal.`,
    t`Log out and back in (or restart) so the new group applies.`,
    t`Open Tone Studio again and press Look for the pedal.`,
  ];
};
const win11Steps = (pedal: string, app: string) => [
  t`Plug the ${pedal} in, switch it on and close ${app}.`,
  `When the pedal is idle, open Device Manager and find ${pedal} MIDI. Leave its Audio and USB Composite Device entries alone.` +
  `${pedal === 'GP-180' ? t` Confirm hardware ID VID_84EF&PID_0188&MI_03.` : ''}`,
  t`Right-click it, choose Update driver, then Browse my computer, then Let me pick from a list.`,
  t`Untick Show compatible hardware, pick USB Audio Device and finish.`,
  t`Unplug the pedal, plug it back in, then press Check again.`,
];

function base(kind: ViewKind, led: Led, chip: string, state: string, detail: string, rest: Partial<ConnectionView> = {}): ConnectionView {
  return {
    kind,
    led,
    chip,
    state,
    detail,
    note: null,
    steps: [],
    action: "connect",
    actionLabel: t`Look for the pedal`,
    statusText: t`Not connected`,
    offline: true,
    openGuide: false,
    ...rest,
  };
}

/** Windows has the pedal on USB but a driver the app can't talk through (or none): the Windows 11 driver guide. */
function driverView(h: DeviceHostStatus | null, pedal: string, attached: DeviceKey | null, silent = false): ConnectionView {
  return base("driver", "fault", "Check driver", t`Possible driver problem`,
    silent ? t`Its MIDI port opened, but the pedal did not answer` : t`Found on USB, but Windows shows no MIDI port for it`, {
    note:
      h?.driver && MIDI2_DRIVER_RE.test(h.driver)
        ? `Windows attached its USB MIDI 2.0 driver. This may explain the failed connection, but does not establish the cause. ` +
          `Diagnostics describes the legacy driver workaround. Change only the MIDI interface when the pedal is not in use; leave its audio interface alone.`
        : t`Windows has no working MIDI driver on the pedal. Giving it the "USB Audio Device" driver fixes it. Follow the steps under Diagnostics.`,
    steps: win11Steps(pedal, vendorApps(attached).editor),
    action: "show-fix",
    actionLabel: t`Show the fix`,
    statusText: silent ? t`${pedal} MIDI port opened without a reply` : t`${pedal} found, but its driver hides the MIDI port`,
    openGuide: true,
  });
}

/** Map the store's connection state (plus host checks) to the header, chip, status bar and fix steps. */
export function connectionView(input: GuidanceInput): ConnectionView {
  const { status, error, mode, hostStatus: h, platform } = input;
  const desktop = platform !== "web";
  const attached = attachedDevice(input);
  const pedal = pedalNameOrBoth(attached);
  const lastSeen = input.lastConnectedAt ? t`Last connected ${formatWhen(input.lastConnectedAt, input.now)}` : t`Not connected yet`;

  if (status === "connected")
    return base("connected", "on", mode === "mock" ? t`Simulated` : mode === "bluetooth" ? "Bluetooth" : "USB",
      mode === "mock" ? t`Simulated pedal` : mode === "bluetooth" ? t`Connected over Bluetooth` : t`Connected over USB`, "since", {
      action: "none",
      actionLabel: null,
      statusText: t`Pedal settings apply on the ${pedal} as you change them`,
      offline: false,
    });

  if (status === "connecting")
    return base("connecting", "warn", "Connecting", "Connecting", t`Reading preset names, active preset and pedal settings`, {
      action: "cancel",
      actionLabel: t`Cancel`,
      statusText: t`Connecting to the ${pedal}`,
    });

  if (status !== "error" || !error) {
    const lost = input.disconnectReason === "lost";
    return base("disconnected", "off", "Not connected", "Not connected", lost ? t`The pedal went away (unplugged or switched off)` : lastSeen, {
      note: mode === "bluetooth"
        ? t`Bluetooth editor management is disabled. Connect by USB to manage the pedal. Bluetooth MIDI remains available for performance controls.`
        : t`${plugIn(pedal)} ${desktop ? t`The app connects by itself. ` : ""}Values below are from the last connection and can't be changed until then.`,
      statusText: t`${pedal} not connected`,
    });
  }

  switch (error.code) {
    case "bootloader":
      return base("bootloader", "warn", "Update mode", t`Firmware update mode`, t`The pedal is on its "Firmware Update / Restore" screen`, {
        note: t`Tone Studio doesn't send anything to a pedal in update mode, so a firmware update can't be interrupted. Finish the update in ${vendorApps(attached).updater}. When the pedal restarts normally, the app connects by itself.`,
        action: "none",
        actionLabel: null,
        statusText: t`${pedal} in firmware update mode, the app is not sending anything`,
      });

    case "unsupported-model":
      // The message names the model (the remembered `pedal` may be another one).
      return base("unsupported-model", "warn", "Not supported", t`Not supported yet`, error.message, {
        note: t`Tone Studio sends nothing to this pedal. Until it is supported, use Valeton's own editor with it. You can still try everything with a simulated ${SUPPORTED_EITHER}.`,
        action: "check",
        actionLabel: t`Check again`,
        statusText: t`Pedal not supported yet`,
      });

    case "unsupported":
      return base("unsupported", "fault", "Not available", t`MIDI not available`, desktop ? t`This build has no WebMIDI` : t`This browser can't talk to MIDI devices`, {
        note: desktop
          ? t`The app's MIDI layer didn't start. Reinstall Tone Studio or report it with the diagnostic report.`
          : t`Talking to the pedal needs the desktop app, or Chrome or Edge on a desktop computer. Firefox and Safari have no MIDI with SysEx. You can still try everything with the simulated pedal.`,
        action: "none",
        actionLabel: null,
        statusText: desktop ? t`MIDI is not available` : t`This browser has no MIDI: use the desktop app or Chrome/Edge`,
      });

    case "insecure":
      return base("insecure", "fault", "Not available", "MIDI blocked", t`WebMIDI only works on https:// or http://localhost`, {
        note: t`Open Tone Studio from a secure address (https) or from localhost, or use the desktop app.`,
        action: "none",
        actionLabel: null,
        statusText: t`MIDI needs a secure page`,
      });

    case "broken-browser":
      return base("broken-browser", "fault", "Browser problem", t`Browser can't use SysEx`, t`Chromium 152 drops the pedal's SysEx replies`, {
        note: desktop
          ? t`This version of the app ships Chromium 152, which can't exchange SysEx with the pedal. Update Tone Studio.`
          : t`Chrome, Edge and other Chromium browsers version 152 can't exchange SysEx with the pedal. Update the browser to version 153 or newer, or use the desktop app.`,
        action: "none",
        actionLabel: null,
        statusText: t`Chromium 152 can't talk to the ${pedal}: update`,
      });

    case "permission":
    case "no-sysex": {
      if (platform === "linux" && h?.linuxSeq && !h.linuxSeq.accessible) return linuxAccess(h);
      const sysex = error.code === "no-sysex";
      return base(sysex ? "no-sysex" : "permission", "fault", "No permission", sysex ? t`SysEx not allowed` : t`MIDI permission denied`, sysex ? t`The pedal is reached with SysEx messages, which weren't allowed` : t`Access to MIDI devices was refused`, {
        steps: desktop
          ? [t`Close other apps that use MIDI devices.`, t`Press Look for the pedal again.`]
          : [
              t`Click the site settings icon left of the address bar.`,
              t`Set "MIDI devices" (control and reprogram MIDI devices) to Allow.`,
              t`Reload the page, then press Look for the pedal.`,
            ],
        statusText: t`MIDI access was refused`,
      });
    }

    case "not-found": {
      if (platform === "linux" && h?.linuxSeq && !h.linuxSeq.accessible) return linuxAccess(h);
      if (pedalOnUsb(h)) {
        if (platform === "win32") return driverView(h, pedal, attached);
        return base("no-port", "warn", t`No MIDI port`, t`No MIDI port`, t`Found on USB, but there is no ${pedal} MIDI port`, {
          note:
            platform === "linux"
              ? t`The kernel sees the pedal but ALSA has no MIDI port for it. Unplug it, wait a few seconds and plug it back in. If that doesn't help, check that the snd-usb-audio module is loaded.`
              : t`The system sees the pedal but has no MIDI port for it. Unplug it, wait a few seconds and plug it back in.`,
          statusText: t`${pedal} on USB without a MIDI port`,
        });
      }
      const ports = error.ports?.length ? t`Visible MIDI ports: ${error.ports.join(", ")}.` : t`No MIDI ports are visible.`;
      return base("disconnected", "off", "Not connected", "Not connected", lastSeen, {
        note: `${plugIn(pedal)} ${ports}${desktop ? t` The app connects by itself when the pedal appears.` : ""}`,
        statusText: t`${pedal} not connected`,
      });
    }

    case "busy": {
      if (platform === "win32" && pedalOnUsb(h) && h?.driver && MIDI2_DRIVER_RE.test(h.driver)) return driverView(h, pedal, attached, true);
      const holder = runningPortHolder(h, attached);
      if (holder) {
        const app = vendorAppName(holder);
        return base("suite", "warn", "In use", `${app} is using the pedal`, t`Close it to connect`, {
          note: t`On Windows only one app can use the pedal at a time. Quit ${app} (also from the system tray), then press Check again.`,
          action: "check",
          actionLabel: t`Check again`,
          statusText: t`${app} has the ${pedal} port`,
        });
      }
      const webOnWindows = platform === "web" && /Windows/i.test(h?.os ?? "");
      const legacyDriver = !!h?.driver && GENERIC_DRIVER_RE.test(h.driver);
      const gp180BtHint = attached === "gp180"
        ? " If Bluetooth is connected, check the pedal's Global Settings > MIDI Settings > MIDI In Source:" +
          " set it to 'Mixed' or 'USB Only' (if set to 'BT Only', the pedal ignores USB MIDI)." +
          " Also disconnect Bluetooth Audio or close Valeton Suite on mobile if active."
        : "";
      const windowsNote = `The MIDI port opened but the handshake received no reply. Another app may hold the port: close ${vendorApps(attached).editor}, any DAW, ` +
        `and other MIDI browser pages. ${legacyDriver
          ? 'The legacy USB audio driver is already installed. After a driver change, reconnect USB and restart Tone Studio. ' +
            'If it stays silent, check whether the official editor detects the pedal, then close it before retrying here.' + gp180BtHint
          : 'Then reconnect USB. If it still fails, review the Windows 11 driver steps under Diagnostics.' + gp180BtHint}`;
      return base("silent", "warn", "No answer", t`The pedal doesn't answer`, t`Its MIDI port opened, but nothing came back`, {
        note:
          platform === "win32"
            ? windowsNote
            : webOnWindows
              ? t`${windowsNote} If nothing else is running, check that chrome://flags/#use-winrt-midi-api matches a browser where the pedal works.`
              : t`Another app may hold the port, or the pedal is busy. Close other MIDI apps, switch the pedal off and on, then try again.`,
        steps: [],
        statusText: t`${pedal} port is silent`,
        openGuide: platform === "win32",
      });
    }

    case "timeout":
      return base("wrong-device", "warn", "No answer", "Unexpected reply", t`A device answered, but not like a ${pedal}`, {
        note: t`Check that this is a ${SUPPORTED_EITHER} (not another Valeton pedal) and that its firmware is up to date. The diagnostic report helps if it keeps happening.`,
        statusText: t`The device on the ${pedal} port answers unexpectedly`,
      });

    default:
      return base("error", "fault", "Not connected", "Couldn't connect", error.message, {
        statusText: t`${pedal} not connected`,
      });
  }
}

function linuxAccess(h: DeviceHostStatus | null): ConnectionView {
  const group = h?.linuxSeq?.group ?? "audio";
  return base("linux-access", "fault", "No access", t`No access to MIDI`, t`This user can't open ${h?.linuxSeq?.path ?? t`/dev/snd/seq`}`, {
    note: t`Linux only lets members of the "${group}" group use MIDI devices on this system.`,
    steps: AUDIO_GROUP_STEPS(h),
    statusText: t`No access to /dev/snd/seq`,
  });
}

/** Inline line under the header when a request on a live session failed ("The pedal stopped answering (timeout)"). */
export function requestErrorLine(e: RequestError | null): string | null {
  if (!e) return null;
  if (e.code === "timeout") return t`The pedal stopped answering (timeout)`;
  if (e.code === "verify") return t`A write couldn't be verified (verify)`;
  if (e.code === "closed") return t`The connection closed during a request (closed)`;
  return t`A request failed (${e.code}): ${e.message}`;
}

// ------------------------------------------------------------------------------------------------ diagnostics checklist

export type CheckState = "ok" | "warn" | "fault" | "idle" | "pending";
export interface Check {
  id: "usb" | "driver" | "port" | "access";
  name: string;
  state: CheckState;
  detail: string;
  hint?: string;
}

const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");

export function diagnosticChecks(input: GuidanceInput & { portName: string | null; webmidi: boolean; chrome: string | null }): Check[] {
  const { status, error, mode, hostStatus: h, platform } = input;
  const view = connectionView(input);
  const mock = mode === "mock" && (status === "connected" || status === "connecting");
  const valeton = h?.usb?.filter((d) => d.vendorId === VALETON_VID) ?? [];
  const onUsb = pedalOnUsb(h);
  const pedal = pedalModelName(input);

  const usb: Check = mock
    ? { id: "usb", name: "USB device", state: "ok", detail: t`Simulated pedal, no USB involved` }
    : view.kind === "bootloader"
      ? { id: "usb", name: "USB device", state: "warn", detail: t`Valeton device in firmware update mode`, hint: t`The app stays silent until the pedal restarts normally.` }
      : onUsb
        ? { id: "usb", name: "USB device", state: "ok", detail: t`Valeton ${pedalName(onUsb)} found, ${hex4(VALETON_VID)}:${hex4(profileFor(onUsb).usbPids[0])}` }
        : !h?.usb
          ? status === "connected"
            ? { id: "usb", name: "USB device", state: "ok", detail: t`The ${pedal} answers over MIDI` }
            : { id: "usb", name: "USB device", state: "idle", detail: platform === "web" ? t`The browser can't list USB devices` : t`Couldn't list USB devices` }
          : {
              id: "usb",
              name: "USB device",
              state: "fault",
              detail: valeton.length ? t`Other Valeton device: ${valeton.map((d) => `${hex4(d.vendorId)}:${hex4(d.productId)}`).join(", ")}` : t`No ${SUPPORTED_EITHER} on USB`,
              hint: t`Use a data cable, not a charge-only one, and plug it straight into the computer rather than a hub.`,
            };

  let driver: Check;
  if (mock) driver = { id: "driver", name: "Driver", state: "ok", detail: t`Simulated pedal, no driver needed` };
  else if (platform === "web") {
    const broken = input.chrome?.split(".")[0] === "152";
    driver = {
      id: "driver",
      name: "Browser",
      state: !input.webmidi || broken ? "fault" : "ok",
      detail: `${input.chrome ? `Chromium ${input.chrome.split(".")[0]}` : "This browser"}${input.webmidi ? (broken ? ": SysEx broken in 152, update to 153+" : " with WebMIDI") : " has no WebMIDI"}`,
      hint: input.webmidi ? undefined : t`Use Chrome or Edge on a desktop computer, or the desktop app.`,
    };
  } else if (platform === "linux" && h?.linuxSeq && !h.linuxSeq.accessible)
    driver = {
      id: "driver",
      name: "Driver",
      state: "fault",
      detail: h.linuxSeq.exists ? t`No access to ${h.linuxSeq.path}` : t`${h.linuxSeq.path} is missing (ALSA sequencer not loaded)`,
      hint: h.linuxSeq.exists ? t`Add your user to the "${h.linuxSeq.group ?? "audio"}" group, then log in again.` : t`Load the snd-seq module: sudo modprobe snd-seq`,
    };
  else if (platform === "win32" && onUsb && h?.driver && MIDI2_DRIVER_RE.test(h.driver))
    driver = { id: "driver", name: "Driver", state: "fault", detail: t`Windows uses "USB MIDI 2.0" for the pedal`, hint: t`Switch it to "USB Audio Device". See the steps below.` };
  else if (platform === "win32" && onUsb && h?.driver && !GENERIC_DRIVER_RE.test(h.driver))
    driver = {
      id: "driver",
      name: "Driver",
      state: "warn",
      detail: t`Windows uses a non-standard driver for the pedal (${h.driver})`,
      hint: t`If the connection drops or the pedal doesn't answer, switch it to "USB Audio Device". See the steps below.`,
    };
  else if (h?.driver)
    driver = {
      id: "driver",
      name: "Driver",
      state: "ok",
      detail: platform === "linux" ? t`Linux ALSA (${h.driver}). Nothing to install.` : platform === "darwin" ? t`macOS CoreMIDI. Nothing to install.` : t`Windows (${h.driver})`,
    };
  else if (onUsb) {
    const { usbMidiInterface, usbPids } = profileFor(onUsb);
    const midiKnown = usbMidiInterface !== null || !!h?.usbInterfaces?.some((i) => i.midi && usbPids.includes(i.productId));
    driver = midiKnown
      ? { id: "driver", name: "Driver", state: "warn", detail: t`No driver is bound to the pedal's MIDI interface` }
      : { id: "driver", name: "Driver", state: "idle", detail: t`Couldn't tell which driver the ${pedalName(onUsb)}'s MIDI interface uses`, hint: t`The diagnostic report lists its USB interfaces.` };
  } else driver = { id: "driver", name: "Driver", state: "idle", detail: t`Checked once the ${pedal} is on USB` };

  const portLabel = input.portName ?? t`the ${pedal} port`;
  const port: Check =
    status === "connected"
      ? { id: "port", name: "MIDI port", state: "ok", detail: t`${portLabel} answers requests` }
      : status === "connecting"
        ? { id: "port", name: "MIDI port", state: "pending", detail: t`Waiting for ${portLabel} to answer` }
        : error?.code === "busy"
          ? { id: "port", name: "MIDI port", state: "warn", detail: t`${pedal} port found, but it doesn't answer` }
          : error?.code === "timeout"
            ? { id: "port", name: "MIDI port", state: "warn", detail: t`A port answered, but not like a ${pedal}` }
            : {
                id: "port",
                name: "MIDI port",
                state: "idle",
                detail: t`No ${pedal} MIDI port`,
                hint: error?.ports ? (error.ports.length ? t`Visible ports: ${error.ports.join(", ")}` : t`No MIDI ports are visible`) : undefined,
              };

  const attached = attachedDevice(input);
  const apps = vendorApps(attached);
  const holder = runningPortHolder(h, attached);
  const shared =
    attached && profileFor(attached).family === "gp200"
      ? t`On Windows only one app can use the pedal at a time. Close ${apps.editor} before connecting.`
      : t`On Windows only one app can use the pedal at a time. If Suite is open, the app asks you to close it before connecting.`;
  const access: Check =
    view.kind === "bootloader"
      ? { id: "access", name: "Exclusive access", state: "idle", detail: t`Left to ${apps.updater}`, hint: t`${apps.updater} owns the connection while it updates the firmware. Tone Studio waits.` }
      : holder
        ? platform === "win32"
          ? { id: "access", name: "Exclusive access", state: "warn", detail: t`${vendorAppName(holder)} is running`, hint: t`Close it to connect. On Windows only one app can use the pedal at a time.` }
          : { id: "access", name: "Exclusive access", state: "ok", detail: t`${vendorAppName(holder)} is running`, hint: t`On this system both apps can use the port, but changes in one don't show in the other.` }
        : h?.vendorApps
          ? { id: "access", name: "Exclusive access", state: "ok", detail: t`${apps.editor} is not running`, hint: shared }
          : { id: "access", name: "Exclusive access", state: "idle", detail: mock ? t`Not needed for the simulated pedal` : platform === "web" ? t`The browser can't see other apps` : t`Couldn't check for ${apps.editor}`, hint: shared };

  return [usb, driver, port, access];
}
