import { useEffect } from "react";
import { host } from "@/host";
import { NOTIFY } from "@/gp200/lib/mod-service.mjs";
import { onSceneEvent, useDevice } from "@/state/device";
import { pedalEventNotice, settingsNotice, type PedalSceneState } from "@/state/pedal-notices";
import { useScenes } from "@/state/scenes";
import { pedalName } from "@/state/device-model";
import { useNav } from "@/state/nav";
import { reconnect } from "./commands";
import { notifyPedal, notifySuccess, showToast } from "./notify";
import { t } from "@lingui/core/macro";

/** An AVISO this soon after our own scene write is its echo (the pedal reloads and reports the new record). */
const OWN_ECHO_MS = 3000;

/**
 * Shell reactions to the device store: a toast when the pedal goes away or comes back (overlays.md C/G), and
 * taskbar/dock progress for long jobs (electron.md › Hardware access).
 */
export function useDeviceWatch(): void {
  useEffect(() => {
    let lostAt: number | null = null;
    let lastProgress: number | null = null;
    return useDevice.subscribe((s, prev) => {
      if (prev.status === "connected" && s.status === "disconnected" && s.disconnectReason === "lost") {
        lostAt = Date.now();
        const edits = s.unsavedChanges;
        showToast({
          tone: "fault",
          title: t`The ${pedalName(s.device)} disconnected`,
          body:
            edits === 0
              ? t`Check the USB cable and power. Tone Studio tries to reconnect on its own.`
              : edits === 1
                ? t`Check the USB cable and power. Tone Studio tries to reconnect on its own. Your unsaved change is still here.`
                : t`Check the USB cable and power. Tone Studio tries to reconnect on its own. Your ${edits} unsaved changes are still here.`,
          action: { label: t`Reconnect`, run: reconnect, retry: true },
        });
      }
      if (s.status === "connected" && prev.status !== "connected" && lostAt !== null) {
        lostAt = null;
        notifySuccess(t`The ${pedalName(s.device)} is back`, t`Reconnected over USB.`, { label: t`Open Rig`, run: () => useNav.getState().go("rig") });
      }
      const progress = s.busy && s.busy.kind !== "sync" ? s.busy.progress : null;
      if (progress !== lastProgress && (progress === null || lastProgress === null || Math.abs(progress - lastProgress) >= 0.01)) {
        lastProgress = progress;
        void host.app.setProgress(progress).catch(() => {});
      }
    });
  }, []);

  // What the player did on the pedal (GrooveGurus mod AVISO): scene stored with PARA or deleted, scene mode switched,
  // the mod's settings changed. Changes made by Tone Studio itself are not announced again.
  useEffect(() => {
    let last: PedalSceneState | null = null;
    const offScenes = onSceneEvent((e) => {
      const next: PedalSceneState = { sceneMode: e.sceneMode, activeScene: e.activeScene, savedScenes: e.savedScenes, slot: e.slot };
      const prev = last;
      last = next;
      const device = useDevice.getState().device;
      if (e.events & NOTIFY.SETTINGS && prev) notifyPedal(settingsNotice(device));
      const { writing, lastWriteAt } = useScenes.getState();
      const echo = writing || Date.now() - lastWriteAt < OWN_ECHO_MS;
      const notice = pedalEventNotice(prev, echo ? { ...next, savedScenes: prev?.savedScenes ?? next.savedScenes } : next, device);
      if (notice) notifyPedal(notice);
    });
    // A new connection starts from the pedal's first AVISO (the state right after HELLO), announced as nothing.
    const offDevice = useDevice.subscribe((s, p) => {
      if (s.status !== p.status) last = null;
    });
    return () => {
      offScenes();
      offDevice();
    };
  }, []);
}
