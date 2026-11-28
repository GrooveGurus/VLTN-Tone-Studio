// The firmware's words in the editor: each status of the GrooveGurus mod's service (gp-200-re servico.h ST_*) and each
// change made on the pedal becomes one notice; Retry only where the pedal can take the same request again.
import { describe, expect, it } from "vitest";
import { STATUS } from "@/gp200/lib/mod-service.mjs";
import { Gp200Error } from "@/gp200/lib/session.mjs";
import { modErrorNotice, pedalEventNotice, type PedalSceneState } from "./pedal-notices";

const modError = (status: number) => Object.assign(new Gp200Error("mod", `scene write: status ${status}`), { status });

describe("mod statuses as notices", () => {
  it("every status of the service has a notice that names the pedal and keeps the raw reason", () => {
    for (const status of Object.values(STATUS).filter((s) => s !== STATUS.OK)) {
      const n = modErrorNotice(modError(status), "Couldn't save scene B", "gp200")!;
      expect(n, `status ${status}`).not.toBeNull();
      expect(n.title.length).toBeGreaterThan(0);
      expect(n.body).not.toMatch(/status \d/);
      expect(n.detail).toBe(`scene write: status ${status}`);
      expect(n.art).toBeDefined();
    }
  });

  it("busy: the pedal waits on its screen; what to do there, and Retry", () => {
    const n = modErrorNotice(modError(STATUS.BUSY), "Couldn't save scene B", "gp200")!;
    expect(n).toMatchObject({ tone: "warn", art: "pedal-busy", title: "The GP-200 is busy", retryable: true });
    expect(n.steps?.[0]).toMatch(/SAVE/);
  });

  it("no space: what to delete, and no Retry (it would fail the same way)", () => {
    const n = modErrorNotice(modError(STATUS.NO_SPACE), "Couldn't save scene B", "gp200")!;
    expect(n).toMatchObject({ tone: "warn", art: "records-full" });
    expect(n.retryable).toBeFalsy();
  });

  it("refused data is a Tone Studio bug: report it with the log", () => {
    for (const s of [STATUS.CHECKSUM, STATUS.LENGTH, STATUS.ARG]) expect(modErrorNotice(modError(s), "Couldn't save scene B", "gp200")).toMatchObject({ tone: "fault", art: "refused", title: "Couldn't save scene B" });
  });

  it("a pedal that doesn't answer: look at its screen, the cable, then Retry", () => {
    const n = modErrorNotice(new Gp200Error("timeout", "scene write: no reply after 4 tries"), "Couldn't save scene B", "gp200")!;
    expect(n).toMatchObject({ tone: "fault", art: "no-reply", retryable: true });
  });

  it("anything else is not the pedal's to explain", () => {
    expect(modErrorNotice(new Error("boom"), "Couldn't save scene B", "gp200")).toBeNull();
    expect(modErrorNotice(null, "Couldn't save scene B", "gp200")).toBeNull();
  });
});

describe("changes made on the pedal", () => {
  const at = (p: Partial<PedalSceneState>): PedalSceneState => ({ sceneMode: true, activeScene: null, savedScenes: 0b0001, slot: 4, ...p });

  it("a scene stored with PARA or deleted on the pedal", () => {
    expect(pedalEventNotice(at({}), at({ savedScenes: 0b0011 }), "gp200")).toMatchObject({ tone: "ok", art: "scene-saved", title: "Scene B saved on the GP-200" });
    expect(pedalEventNotice(at({ savedScenes: 0b0011 }), at({ savedScenes: 0b0010 }), "gp200")).toMatchObject({ art: "scene-deleted", title: "Scene A deleted on the GP-200" });
  });

  it("scene mode switched on the pedal", () => {
    expect(pedalEventNotice(at({ sceneMode: false }), at({}), "gp200")?.title).toBe("Scene mode on, on the GP-200");
    expect(pedalEventNotice(at({}), at({ sceneMode: false }), "gp200")?.title).toBe("Scene mode off, on the GP-200");
  });

  it("nothing for a scene switch, another preset or the first report after HELLO", () => {
    expect(pedalEventNotice(at({}), at({ activeScene: 2 }), "gp200")).toBeNull();
    expect(pedalEventNotice(at({}), at({ slot: 5, savedScenes: 0b1111 }), "gp200")).toBeNull();
    expect(pedalEventNotice(null, at({}), "gp200")).toBeNull();
  });
});
