// Scenes of the active preset on a pedal running the GrooveGurus mod (feature "modScenes"): read them, play one on the
// pedal to edit it on the Rig, and write it back. The device store owns the connection; this store asks its driver.
import { create } from "zustand";
import { NOTIFY, SCENE_CTRLS, type ModSettings, type Scene } from "@/gp200/lib/mod-service.mjs";
import { playPreset } from "@/screens/rig/edits";
import { useHistory } from "@/screens/rig/history";
import { useModGuests } from "@/gp200/app/guest-store";
import { DeviceError, getDriver, onSceneEvent, useDevice } from "./device";
import type { PresetState } from "./device-types";
import type { SceneList, SlotScenes } from "./driver/types";
import { applyScene, captureScene, ctrlMasks, sceneName, scenesOf, withScene, type CapturedScene } from "./scenes-model";
import { t } from "@lingui/core/macro";

export interface ScenesState {
  /** The record of the active slot as last read; null before the first read or without the feature */
  current: SlotScenes | null;
  loading: boolean;
  /** Why the last read failed */
  error: string | null;
  /** The failure itself (a mod status, a timeout), for the pedal's notice */
  errorCause: unknown;
  /** Scene records on the pedal (used per slot, free) */
  list: SceneList | null;
  /** What the pedal reports (NOTIFY): scene mode and the scene it plays (null = the base) */
  pedal: { sceneMode: boolean; activeScene: number | null } | null;
  /** What the editor edits: the preset, or its scenes (the footswitches on screen). Follows the pedal's scene mode
   * when that changes; picked in the title bar otherwise */
  mode: "preset" | "scene";
  /** The scene the Rig plays and edits (0-3), or null: edits then go to the base preset as usual */
  editing: number | null;
  /** A scene write is on its way */
  writing: boolean;
  /** When the last scene write of this app ended (ms): the pedal's AVISO about it is an echo, not a change on the pedal */
  lastWriteAt: number;
  /** CTRL 1-4 switched on from the footswitches on screen; all off on every scene change, like the pedal */
  ctrlOn: boolean[];
  /** The mod's Tap Tempo setting ("disabled": TAP is CTRL 4); null until read */
  tapTempo: ModSettings["tapTempo"] | null;

  /** Read the active slot's scenes and the record list again. */
  refresh(): Promise<void>;
  /** Play scene `k` on the pedal (the base when it isn't saved yet); Rig edits then build that scene. */
  edit(k: number): Promise<void>;
  /** Play the base again and stop editing the scene. */
  leave(): Promise<void>;
  /** What saving the Rig's sound as scene `k` would store (nothing is written), with what stays out of it. */
  capture(k: number): CapturedScene;
  /**
   * Save what the Rig plays now as scene `k` (its differences from the saved preset), named `name` when given (cleaned
   * for the pedal), else keeping the scene's name. Saving while another scene is edited moves the edit to `k`: the sound
   * now lives there, and the scene it came from stays as stored.
   */
  save(k: number, name?: string): Promise<CapturedScene>;
  rename(k: number, name: string): Promise<void>;
  remove(k: number): Promise<void>;
  /** CTRL `n` (0-3) footswitch: switch its blocks on the Rig, like the pedal in scene mode. */
  toggleCtrl(n: number): void;
  /** Edit the preset or its scenes; back to "preset" while a scene is edited plays the base again. */
  setMode(mode: "preset" | "scene"): Promise<void>;
}

const CTRLS_OFF = (): boolean[] => Array(SCENE_CTRLS).fill(false);

/** The scene the pedal plays in scene mode (null: scene mode off, or the base playing). */
const pedalScene = (p: ScenesState["pedal"]): number | null => (p?.sceneMode ? p.activeScene : null);

/**
 * Make the Rig play `target`: live edits for what the pedal takes live, and the CTRL assignments on the Rig (the GP-200
 * takes them with a preset write only), so saving the scene keeps its CTRLs. CTRLs start off; the undo history restarts.
 */
async function playOnRig(target: PresetState) {
  await playPreset(target);
  const d = dev();
  if (d.preset && d.preset.footswitches.some((l, i) => l.join() !== target.footswitches[i]?.join())) d.setFootswitches(target.footswitches);
  useScenes.setState({ ctrlOn: CTRLS_OFF() });
  useHistory.getState().clear();
}

/**
 * After a write of the scene being edited the pedal goes back to the base and the app re-reads what plays. The scene
 * stays selected: once the write is done and that re-read has come (or after a while without it), the Rig plays the
 * saved scene again.
 */
let resume: { k: number; written: boolean; synced: boolean; timer?: ReturnType<typeof setTimeout>; rig?: { preset: PresetState; ctrlOn: boolean[] } } | null = null;
const RESUME_FALLBACK_MS = 1500;

async function resumeScene() {
  const r = resume;
  if (!r || !r.written || !r.synced) return;
  clearTimeout(r.timer);
  resume = null;
  const { editing, current } = useScenes.getState();
  const base = dev().saved;
  if (editing !== r.k || !base || dev().status !== "connected") return;
  try {
    // A rename or a delete gives the Rig back what it played (edits not saved into the scene yet included); a save
    // plays the scene as stored.
    if (r.rig) {
      await playOnRig(r.rig.preset);
      useScenes.setState({ ctrlOn: r.rig.ctrlOn });
    } else await playOnRig(applyScene(base, scenesOf(current?.record ?? null)[r.k]));
  } catch {
    useScenes.setState({ editing: null });
  }
}

const dev = () => useDevice.getState();

function driverFor(write: boolean) {
  const d = dev();
  const driver = getDriver();
  if (!driver || d.status !== "connected") throw new DeviceError("not-connected", t`The pedal is not connected`);
  if (!d.can(write ? "modScenesWrite" : "modScenes") || !driver.readScenes) throw new DeviceError("unsafe", write ? t`The pedal's mod can't write scenes` : t`The pedal doesn't run the GrooveGurus mod`);
  if (d.busy) throw new DeviceError("busy", t`Wait until the ${d.busy.kind} finishes`);
  return driver;
}

export const useScenes = create<ScenesState>((set, get) => {
  /** Reads of an older slot that finish late are dropped. */
  let readSeq = 0;

  const writable = () => {
    const { current } = get();
    const slot = dev().slot;
    if (slot === null || !current || current.slot !== slot) throw new DeviceError("busy", t`The scenes of this preset are still being read`);
    if (current.bytes && !current.record) throw new DeviceError("unsafe", t`These scenes were saved by a newer mod (${current.error ?? t`unknown format`}); Tone Studio can only show that they exist`);
    return { slot, current };
  };

  /** `keepRig`: the Rig plays the same again after the write (rename, delete), not the stored scene (save). */
  const write = async (slot: number, scenes: (Scene | null)[], keepRig = false) => {
    const driver = driverFor(true);
    set({ writing: true });
    const k = get().editing;
    const rig = keepRig && dev().preset ? { preset: dev().preset!, ctrlOn: get().ctrlOn } : undefined;
    resume = k === null ? null : { k, written: false, synced: false, ...(rig ? { rig } : {}) };
    try {
      const pre2 = get().current?.record?.pre2 ?? null;
      const stored = await driver.writeScenes!(slot, scenes, pre2);
      set({ current: stored, error: null });
      if (resume) {
        // The pedal went back to the base (it reloads the active preset after a write): play the scene again.
        resume.written = true;
        resume.timer = setTimeout(() => {
          if (resume) resume.synced = true;
          void resumeScene();
        }, RESUME_FALLBACK_MS);
        void resumeScene();
      }
      await readList();
      return stored;
    } catch (e) {
      resume = null;
      throw e;
    } finally {
      set({ writing: false, lastWriteAt: Date.now() });
    }
  };

  const readList = async () => {
    const driver = getDriver();
    if (!driver?.readSceneList || !dev().can("modScenes")) return;
    try {
      set({ list: await driver.readSceneList() });
    } catch {
      // the list is a convenience (marks, free count); the next event reads it again
    }
  };

  const readSettings = async () => {
    const driver = getDriver();
    if (!driver?.readModSettings || !dev().can("modSettings")) return;
    try {
      set({ tapTempo: (await driver.readModSettings()).tapTempo });
    } catch {
      // without it the TAP footswitch shows as TAP; the next settings notify reads it again
    }
  };

  return {
    current: null,
    loading: false,
    error: null,
    errorCause: null,
    list: null,
    pedal: null,
    mode: "preset",
    editing: null,
    writing: false,
    lastWriteAt: 0,
    ctrlOn: CTRLS_OFF(),
    tapTempo: null,

    async refresh() {
      const slot = dev().slot;
      const driver = getDriver();
      if (slot === null || !driver?.readScenes || !dev().can("modScenes") || dev().status !== "connected") return;
      const seq = ++readSeq;
      set({ loading: true });
      try {
        const current = await driver.readScenes(slot);
        if (seq === readSeq) set({ current, error: null, errorCause: null });
      } catch (e) {
        if (seq === readSeq) set({ error: (e as Error)?.message ?? String(e), errorCause: e });
      } finally {
        if (seq === readSeq) set({ loading: false });
      }
      await readList();
      if (get().tapTempo === null) await readSettings();
    },

    async edit(k) {
      driverFor(false);
      const { current } = writable();
      const base = dev().saved;
      if (!base) throw new DeviceError("busy", t`The preset is still being read`);
      const scene = scenesOf(current.record)[k];
      set({ editing: k, mode: "scene" });
      try {
        await playOnRig(applyScene(base, scene));
      } catch (e) {
        set({ editing: null });
        throw e;
      }
    },

    async leave() {
      const base = dev().saved;
      resume = null;
      set({ editing: null, ctrlOn: CTRLS_OFF() });
      useHistory.getState().clear();
      if (base && dev().status === "connected") await playOnRig(base);
    },

    capture(k) {
      const { current } = writable();
      const { saved, preset } = dev();
      if (!saved || !preset) throw new DeviceError("busy", t`The preset is still being read`);
      return captureScene(saved, preset, k, scenesOf(current.record)[k], get().ctrlOn);
    },

    async save(k, name) {
      const { slot, current } = writable();
      const captured = get().capture(k);
      if (name !== undefined) captured.scene.name = sceneName(name, k);
      // The pedal goes back to the base after the write; the scene that plays again on the Rig is the one saved.
      const editing = get().editing;
      if (editing !== null && editing !== k) set({ editing: k });
      try {
        await write(slot, withScene(current.record, k, captured.scene));
      } catch (e) {
        if (editing !== null && get().editing === k) set({ editing });
        throw e;
      }
      return captured;
    },

    async rename(k, name) {
      const { slot, current } = writable();
      const scene = scenesOf(current.record)[k];
      if (!scene) throw new DeviceError("unsafe", t`Save the scene before naming it`);
      const next = sceneName(name, k);
      if (next === scene.name) return;
      await write(slot, withScene(current.record, k, { ...scene, name: next }), true);
    },

    async remove(k) {
      const { slot, current } = writable();
      if (!scenesOf(current.record)[k]) return;
      await write(slot, withScene(current.record, k, null), true);
    },

    async setMode(mode) {
      if (mode === get().mode) return;
      set({ mode });
      if (mode === "preset" && get().editing !== null) await get().leave();
    },

    toggleCtrl(n) {
      const d = dev();
      const p = d.preset;
      const mask = p ? (ctrlMasks(p)[n] ?? 0) : 0;
      if (!p || !mask) return;
      p.blocks.forEach((b, i) => {
        if (mask & (1 << i)) d.setBlockEnabled(i, !b.enabled);
      });
      set({ ctrlOn: get().ctrlOn.map((on, i) => (i === n ? !on : on)) });
    },
  };
});

// Follow the connection: read the scenes of each preset that becomes active; forget them when the pedal goes away.
useDevice.subscribe((s, p) => {
  const usable = s.status === "connected" && s.features.includes("modScenes");
  const wasUsable = p.status === "connected" && p.features.includes("modScenes");
  if (!usable) {
    resume = null;
    if (useModGuests.getState().byBlock) useModGuests.setState({ byBlock: null });
    if (wasUsable || useScenes.getState().current)
      useScenes.setState({ current: null, list: null, pedal: null, mode: "preset", editing: null, error: null, loading: false, ctrlOn: CTRLS_OFF(), tapTempo: null });
    return;
  }
  if (!wasUsable) void readGuests();
  if (!wasUsable || s.slot !== p.slot) {
    resume = null;
    // Another preset: the scene the pedal plays in it (if any) is what the Rig edits now; its NOTIFY corrects it.
    const k = pedalScene(useScenes.getState().pedal);
    useHistory.getState().clear();
    useScenes.setState({ editing: k, ...(k !== null ? { mode: "scene" as const } : {}), ctrlOn: CTRLS_OFF(), ...(s.slot !== useScenes.getState().current?.slot ? { current: null } : {}) });
    void useScenes.getState().refresh();
    return;
  }
  // The re-read of what plays after our own write: the scene being edited can play again.
  if (resume && s.saved !== p.saved) {
    resume.synced = true;
    void resumeScene();
  }
});

/** The mod's guests of every block, once per connection: the model picker lists them after the block's own models. */
async function readGuests() {
  const driver = getDriver();
  if (!driver?.readModGuests || !dev().can("modGuests")) return;
  try {
    const byBlock: Record<number, Awaited<ReturnType<NonNullable<typeof driver.readModGuests>>>> = {};
    for (let b = 0; b < 11; b++) byBlock[b] = await driver.readModGuests(b);
    if (getDriver() === driver) useModGuests.setState({ byBlock });
  } catch {
    // without the list the picker shows the block's own models; a preset's guest still shows by its origin
  }
}

let recordTimer: ReturnType<typeof setTimeout> | undefined;
onSceneEvent((e) => {
  const prev = useScenes.getState().pedal;
  const pedal = { sceneMode: e.sceneMode, activeScene: e.activeScene };
  const changed = !prev || prev.sceneMode !== pedal.sceneMode || prev.activeScene !== pedal.activeScene;
  // The pedal took over the sound (another scene, scene mode, its base): the editor follows it. With a scene playing
  // in scene mode the Rig edits that scene (the pedal re-reads it as the base plus the scene), so edits made on the
  // pedal or here are saved into the scene, not into the slot; the base or scene mode off edits the preset again. Not
  // after our own write, when the pedal goes back to the base by itself (the scene plays again on the Rig).
  const k = pedalScene(pedal);
  // Our write sends the pedal back to the base: a scene picked on the pedal meanwhile is the player's, and wins.
  const ours = useScenes.getState().writing || (resume !== null && k === null);
  const follow = (e.events & NOTIFY.SCENE) !== 0 && changed && !ours;
  if (follow && resume) {
    clearTimeout(resume.timer);
    resume = null;
  }
  // Scene mode switched on the pedal (double tap on CTRL 1): the editor follows it.
  const modeChanged = !prev || prev.sceneMode !== pedal.sceneMode;
  if (follow) useHistory.getState().clear();
  useScenes.setState({
    pedal,
    ...(modeChanged ? { mode: pedal.sceneMode ? "scene" : "preset" } : {}),
    ...(follow ? { editing: k, ctrlOn: CTRLS_OFF(), ...(k !== null ? { mode: "scene" as const } : {}) } : {}),
  });
  if (e.events & NOTIFY.SETTINGS) void getDriver()?.readModSettings?.().then(({ tapTempo }) => useScenes.setState({ tapTempo }), () => {});
  if (e.events & NOTIFY.RECORD && !useScenes.getState().writing) {
    clearTimeout(recordTimer);
    recordTimer = setTimeout(() => void useScenes.getState().refresh(), 200);
  }
});
