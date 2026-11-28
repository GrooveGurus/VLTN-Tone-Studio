// What the pedal's firmware says, in the editor's words: the GrooveGurus mod's service statuses (gp-200-re
// mods/gp-snap/src/servico.h, ST_*), the transport's failures and the mod's workflow events (AVISO) become one notice
// each, drawn by components/pedal/PedalNotice. Screens never show a raw status ("scene write: status 3").
import { STATUS as MOD_STATUS } from "@/gp200/lib/mod-service.mjs";
import { pedalName } from "./device-model";
import type { DeviceKey } from "./device-types";
import { t } from "@lingui/core/macro";

export type NoticeTone = "ok" | "info" | "warn" | "fault";

/** The drawing beside a notice (components/pedal/illustrations.tsx). */
export type NoticeArt =
  | "pedal-busy" // the pedal's screen is waiting (SAVE, a question): answer there
  | "records-full" // every scene record is used
  | "mod-update" // the mod and the editor don't speak the same version
  | "no-reply" // nothing came back over USB
  | "refused" // the pedal checked the data and said no
  | "scene-saved" // a scene was stored (here or on the pedal)
  | "scene-deleted"
  | "scene-mode" // scene mode switched on the pedal
  | "settings"; // the mod's settings changed

export interface PedalNoticeSpec {
  tone: NoticeTone;
  title: string;
  body: string;
  /** What to do on the pedal itself, in order (shown as a short numbered list) */
  steps?: string[];
  art?: NoticeArt;
  /** A retry makes sense: the same request can work once the pedal is ready */
  retryable?: boolean;
  /** The raw reason, for the session log and bug reports (shown folded) */
  detail?: string;
}

interface ErrorLike {
  code?: string;
  status?: number;
  message?: string;
}

/**
 * The notice for a failure while talking to the mod, or null when `error` isn't one (callers then show their usual
 * message). `failedTitle` is the caller's own title for the failure, already in the user's language: "Couldn't save
 * scene B".
 */
export function modErrorNotice(error: unknown, failedTitle: string, device: DeviceKey | null): PedalNoticeSpec | null {
  const e = (error ?? {}) as ErrorLike;
  const pedal = pedalName(device);
  const detail = e.message;
  const cant = failedTitle;
  if (e.code === "timeout")
    return {
      tone: "fault",
      art: "no-reply",
      title: cant,
      body: t`The ${pedal} didn't answer after 3 tries. It may be busy on its own screen, or the USB cable came loose.`,
      steps: [t`Look at the ${pedal}'s screen and close any message there`, t`Check the USB cable, then retry`],
      retryable: true,
      detail,
    };
  if (e.code !== "mod") return null;
  switch (e.status) {
    case MOD_STATUS.BUSY:
      return {
        tone: "warn",
        art: "pedal-busy",
        title: t`The ${pedal} is busy`,
        body: t`It is saving a scene, waiting on its screen, or reloading the scenes of this preset. Nothing was changed.`,
        steps: [t`On the pedal, finish naming the scene (SAVE) or answer the delete question`, t`Retry here`],
        retryable: true,
        detail,
      };
    case MOD_STATUS.NO_SPACE:
      return {
        tone: "warn",
        art: "records-full",
        title: t`No room for more scenes`,
        body: t`The ${pedal} keeps scenes for 42 presets at most, and all 42 are used. Nothing was changed.`,
        steps: [t`Delete the scenes of a preset you no longer use`, t`Then save this scene again`],
        detail,
      };
    case MOD_STATUS.CHECKSUM:
    case MOD_STATUS.LENGTH:
    case MOD_STATUS.ARG:
      return {
        tone: "fault",
        art: "refused",
        title: cant,
        body: t`The ${pedal} checked what Tone Studio sent and refused it, so it kept what it had. This is a bug in Tone Studio.`,
        steps: [t`Save the session log (Device › Diagnostics) and report it`],
        detail,
      };
    case MOD_STATUS.OWNER:
      return {
        tone: "fault",
        art: "refused",
        title: cant,
        body: t`These scenes belong to another preset on the ${pedal} (a preset moved since they were read). Nothing was changed.`,
        steps: [t`Select the preset again so Tone Studio reads its scenes`, t`Then retry`],
        detail,
      };
    case MOD_STATUS.VERSION:
    case MOD_STATUS.OP:
      return {
        tone: "warn",
        art: "mod-update",
        title: t`The mod and Tone Studio don't match`,
        body: t`The mod on the ${pedal} doesn't know this request. Update the mod or Tone Studio, whichever is older.`,
        detail,
      };
    default:
      return {
        tone: "fault",
        art: e.status === undefined ? "mod-update" : "refused",
        title: cant,
        body: e.status === undefined ? t`The ${pedal} doesn't run a mod that can do this.` : t`The ${pedal} answered with an unknown status (${e.status}).`,
        detail,
      };
  }
}

/** What the pedal reports in its AVISO: scene mode, the scene playing, which scenes exist. */
export interface PedalSceneState {
  sceneMode: boolean;
  activeScene: number | null;
  /** bit k = scene A+k exists */
  savedScenes: number;
  slot: number;
}

const LETTERS = ["A", "B", "C", "D"];

/**
 * The notice for a change made on the pedal itself (not by Tone Studio): a scene stored with PARA or deleted by holding
 * its footswitch, scene mode switched with a double tap on CTRL 1. Switching scenes is shown by the footswitches on
 * screen, not by a notice. Null when there is nothing worth saying.
 */
export function pedalEventNotice(prev: PedalSceneState | null, next: PedalSceneState, device: DeviceKey | null): PedalNoticeSpec | null {
  const pedal = pedalName(device);
  if (!prev || prev.slot !== next.slot) return null;
  if (prev.sceneMode !== next.sceneMode)
    return next.sceneMode
      ? { tone: "info", art: "scene-mode", title: t`Scene mode on, on the ${pedal}`, body: t`The footswitches play scenes A–D. Edits here go into the scene that plays.` }
      : { tone: "info", art: "scene-mode", title: t`Scene mode off, on the ${pedal}`, body: t`Edits here go into the preset again.` };
  const added = next.savedScenes & ~prev.savedScenes;
  const removed = prev.savedScenes & ~next.savedScenes;
  const k = (mask: number) => LETTERS.findIndex((_, i) => mask & (1 << i));
  if (added) return { tone: "ok", art: "scene-saved", title: t`Scene ${LETTERS[k(added)]} saved on the ${pedal}`, body: t`Tone Studio read it back; it is in the Scenes panel.` };
  if (removed) return { tone: "info", art: "scene-deleted", title: t`Scene ${LETTERS[k(removed)]} deleted on the ${pedal}`, body: t`The preset and the other scenes stay as they are.` };
  return null;
}

/** The mod's own settings changed on the pedal (GLOBAL › Footswitch). */
export const settingsNotice = (device: DeviceKey | null): PedalNoticeSpec => ({
  tone: "info",
  art: "settings",
  title: t`Mod settings changed on the ${pedalName(device)}`,
  body: t`Tone Studio follows them, for example TAP as CTRL 4.`,
});
