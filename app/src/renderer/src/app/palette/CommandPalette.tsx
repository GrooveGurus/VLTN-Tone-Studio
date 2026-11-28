import { useMemo, useState, type ReactNode } from "react";
import { Command as CommandPrimitive } from "cmdk";
import type { LucideIcon } from "lucide-react";
import {
  AudioLines,
  AudioWaveform,
  Cable,
  Drum,
  ExternalLink,
  FileUp,
  FolderOpen,
  GitCompareArrows,
  Guitar,
  HardDriveDownload,
  Info,
  LibraryBig,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Sparkles,
  Speaker,
  Stethoscope,
  Unplug,
  Upload,
  Usb,
} from "lucide-react";
import { modelsFor } from "@/gp5/lib/catalog.mjs";
import { parsePrst } from "@/gp5/lib/prst.mjs";
import { useLibrary } from "@/screens/library/store";
import { useBandPanel } from "@/screens/song/band-panel-state";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { isElectron } from "@/host";
import { useDevice, useProfile } from "@/state/device";
import { DEFAULT_DEVICE, blockCodes, isGp5Family, pedalName } from "@/state/device-model";
import { snapToneLabel } from "@shared/devices";
import type { BlockCode, ModelInfo } from "@/state/device-types";
import { runCommand, useUi, type AppCommand } from "@/state/ui";
import { useNav, type Screen } from "@/state/nav";
import { keyLabel } from "../keys";
import { reconnect, runMenuCommand } from "../commands";
import { notifyError } from "../notify";
import { requestPresetSwitch } from "../preset-switch";
import { rank, splitByRanges, type Range, type Searchable } from "./search";
import { t as lt } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/** One palette row. `id` is unique across groups and is cmdk's item value. */
interface Entry {
  id: string;
  search: Searchable;
  /** Enter verb shown in the footer: "load preset", "set AMP model", "run" */
  verb: string;
  /** Why it can't run right now ("Needs the GP-50"); disabled when set */
  blocked?: string;
  run(): void;
  render(ranges: readonly Range[]): ReactNode;
}

interface Group {
  heading: string;
  entries: Entry[];
  /** Rows shown for an empty query (recents first); undefined = group hidden until typing */
  idle?: number;
  limit: number;
}

/** fxid per block of a .prst body, cached per byte array (bodies come from the last backup or read). */
const fxidCache = new WeakMap<Uint8Array, number[]>();
function blockFxids(prst: Uint8Array): number[] {
  let f = fxidCache.get(prst);
  if (!f) {
    try {
      f = (parsePrst(prst).blocks as { fxid: number }[]).map((b) => b.fxid >>> 0);
    } catch {
      f = [];
    }
    fxidCache.set(prst, f);
  }
  return f;
}

function Name({ text, ranges, className }: { text: string; ranges: readonly Range[]; className?: string }) {
  return (
    <span className={cn("truncate", className)}>
      {splitByRanges(text, ranges).map((p, i) =>
        p.hit ? (
          <mark key={i} className="bg-transparent font-bold text-silkscreen">
            {p.text}
          </mark>
        ) : (
          p.text
        ),
      )}
    </span>
  );
}

const Hint = ({ children }: { children: ReactNode }) => <span className="shrink-0 text-xs whitespace-nowrap text-silkscreen-3">{children}</span>;
const Keys = ({ keys }: { keys: string[] }) => <Kbd className="h-5 rounded-xs bg-white/8 px-1.5 text-[11px] font-semibold text-silkscreen-2 shadow-[inset_0_0_0_1px_var(--glass-edge)]">{keyLabel(keys)}</Kbd>;

function BlockChip({ code }: { code: string }) {
  return (
    <span className="inline-flex w-10 shrink-0 items-center gap-1.5 text-xs font-bold text-silkscreen-2" style={{ "--c": `var(--block-${code.toLowerCase()})` } as React.CSSProperties}>
      <span className="size-2 rounded-pill bg-(--c)" aria-hidden />
      {code}
    </span>
  );
}

function actionEntry(o: { id: string; label: string; icon: LucideIcon; hint?: ReactNode; keys?: string[]; words?: string[]; blocked?: string; run(): void }): Entry {
  const Icon = o.icon;
  return {
    id: `action:${o.id}`,
    search: { primary: o.label, secondary: o.words },
    verb: "run",
    blocked: o.blocked,
    run: o.run,
    render: (ranges) => (
      <>
        <Icon className="size-4 text-silkscreen-3 group-data-[selected=true]:text-silkscreen" aria-hidden />
        <Name text={o.label} ranges={ranges} className="flex-1" />
        {o.blocked ? <Hint>{o.blocked}</Hint> : o.keys ? <Keys keys={o.keys} /> : o.hint ? <Hint>{o.hint}</Hint> : null}
      </>
    ),
  };
}

function useGroups(close: () => void): Group[] {
  const names = useDevice((s) => s.names);
  const slot = useDevice((s) => s.slot);
  const status = useDevice((s) => s.status);
  const unsaved = useDevice((s) => s.unsavedChanges);
  const preset = useDevice((s) => s.preset);
  const snapTones = useDevice((s) => s.snapTones);
  const userIRs = useDevice((s) => s.userIRs);
  const busy = useDevice((s) => s.busy);
  const lastDevice = useDevice((s) => s.device);
  const profile = useProfile();
  const recent = useUi((s) => s.recentSlots);
  const connected = status === "connected";

  return useMemo(() => {
    // Model catalog: the live preset's model, else the connected (or last connected) pedal's, else DEFAULT_DEVICE's
    // for browsing before any pedal was connected. Only the GP-5 family has a model catalog.
    const catalogDevice = preset?.device ?? lastDevice ?? DEFAULT_DEVICE;
    const catalog = isGp5Family(catalogDevice) ? catalogDevice : null;
    const codes: readonly BlockCode[] = catalog ? blockCodes(catalog) : [];
    const needsPedal = lt`Needs the ${pedalName(lastDevice)}`;
    const pedal = connected ? (busy ? lt`Wait for the ${busy.kind}` : undefined) : needsPedal;
    const cmd = (c: AppCommand) => () => {
      close();
      runCommand(c);
    };
    const go = (screen: Screen, param?: string) => () => {
      close();
      useNav.getState().go(screen, param);
    };
    const nn = slot === null ? null : profile.slotLabel(slot);

    // Presets: current, then recents, then the rest in slot order.
    const order = [...(slot !== null ? [slot] : []), ...recent.filter((s) => s !== slot)];
    const byPriority = [...names].sort((a, b) => {
      const ia = order.indexOf(a.slot);
      const ib = order.indexOf(b.slot);
      return (ia < 0 ? 1e3 : ia) - (ib < 0 ? 1e3 : ib) || a.slot - b.slot;
    });
    const presets: Entry[] = byPriority.map((n) => ({
      id: `preset:${n.slot}`,
      search: { primary: n.name, slot: n.slot },
      verb: "load preset",
      blocked: connected && n.slot !== slot ? pedal : undefined,
      run: () => {
        close();
        if (n.slot === slot) useNav.getState().go("rig");
        else void requestPresetSwitch(n.slot);
      },
      render: (ranges) => (
        <>
          <span className="min-w-5 shrink-0 font-semibold text-silkscreen-3 tabular-nums">{profile.slotLabel(n.slot)}</span>
          <Name text={n.name} ranges={ranges} className="flex-1" />
          {n.slot === slot ? <Badge><Trans>Current</Trans></Badge> : !connected ? <Hint><Trans>Last read</Trans></Hint> : recent.includes(n.slot) ? <Hint><Trans>Recent</Trans></Hint> : null}
        </>
      ),
    }));

    const actions: Entry[] = [
      actionEntry({
        id: "backup",
        label: lt`Back up now`,
        icon: HardDriveDownload,
        hint: lt`All ${profile.slotCount} slots, about ${profile.backupSeconds} s`,
        words: ["backup"],
        blocked: pedal,
        run: cmd("backup-pedal"),
      }),
      actionEntry({
        id: "compare",
        label: lt`Compare with saved`,
        icon: GitCompareArrows,
        hint: unsaved ? lt`${unsaved} change${unsaved === 1 ? "" : "s"}` : lt`No changes`,
        blocked: preset ? undefined : needsPedal,
        run: cmd("compare-with-saved"),
      }),
      actionEntry({ id: "save", label: nn ? lt`Save to slot ${nn}` : lt`Save to slot`, icon: Save, keys: ["Mod", "S"], blocked: pedal, run: cmd("save-to-slot") }),
      actionEntry({ id: "rename", label: nn ? lt`Rename slot ${nn}` : lt`Rename slot`, icon: Pencil, keys: ["F2"], blocked: pedal, run: cmd("rename-slot") }),
      actionEntry({ id: "write-file", label: lt`Write a preset file to a slot…`, icon: Upload, words: ["prst"], blocked: pedal, run: cmd("write-file-to-slot") }),
      actionEntry({ id: "discard", label: lt`Discard changes`, icon: RotateCcw, words: ["revert"], blocked: unsaved ? pedal : "No changes", run: cmd("discard-changes") }),
      actionEntry({ id: "import", label: lt`Import presets…`, icon: FileUp, keys: ["Mod", "O"], words: ["prst", "file"], run: cmd("import-presets") }),
      actionEntry({ id: "export", label: lt`Export preset…`, icon: FileUp, keys: ["Mod", "E"], words: ["prst", "file"], run: cmd("export-preset") }),
      actionEntry({
        id: "tone-match",
        label: lt`Tone match`,
        icon: Guitar,
        hint: lt`Match a song's guitar tone on the ${pedalName(lastDevice)}`,
        words: ["tone match", "match", "guitar", "song", "stems", "preset", "ir"],
        run: go("song", "tone"),
      }),
      actionEntry({ id: "split-song", label: lt`Split a song into stems`, icon: AudioLines, words: ["stems", "song", "separate", "guitar", "vocals", "drums"], run: go("song", "stems") }),
      actionEntry({
        id: "generate-band",
        label: lt`Generate drums and bass…`,
        icon: Drum,
        words: ["band", "drums", "bass", "parts", "backing", "generate"],
        run: () => {
          close();
          useNav.getState().go("song", "performance");
          useBandPanel.getState().show(true);
        },
      }),
      actionEntry({ id: "backups-folder", label: lt`Open backups folder`, icon: FolderOpen, run: cmd("open-backups-folder") }),
      actionEntry({
        id: "reconnect",
        label: connected ? lt`Reconnect` : lt`Connect the ${pedalName(lastDevice)}`,
        icon: Unplug,
        words: ["connect", "usb", "midi"],
        blocked: busy ? lt`Wait for the ${busy.kind}` : undefined,
        run: () => {
          close();
          void reconnect();
        },
      }),
      actionEntry({ id: "settings", label: lt`Device settings`, icon: Settings2, keys: ["Mod", ","], words: ["preferences", "options"], run: go("device", "settings") }),
      actionEntry({ id: "diagnostics", label: lt`Diagnostics report`, icon: Stethoscope, words: ["help", "driver", "troubleshooting"], run: cmd("diagnostics-report") }),
      actionEntry({
        id: "about",
        label: lt`About VLTN Tone Studio`,
        icon: Info,
        words: ["version"],
        run: () => {
          close();
          runMenuCommand("about");
        },
      }),
      actionEntry({
        id: "whats-new",
        label: lt`What's new`,
        icon: Sparkles,
        words: ["release", "changelog", "version"],
        run: () => {
          close();
          runMenuCommand("whats-new");
        },
      }),
      ...(isElectron
        ? [
            actionEntry({
              id: "check-updates",
              label: lt`Check for updates`,
              icon: RefreshCw,
              words: ["update", "upgrade", "new version", "release"],
              run: () => {
                close();
                runMenuCommand("check-updates");
              },
            }),
          ]
        : []),
    ];

    const screens: Entry[] = (
      [
        ["rig", "Rig", Cable, "1"],
        ["library", "Library", LibraryBig, "2"],
        ["tones", "Tones", AudioWaveform, "3"],
        ["device", "Device", Usb, "4"],
        ["song", "Song", AudioLines, "5"],
      ] as const
    ).map(([screen, label, icon, n]) => actionEntry({ id: `go-${screen}`, label: lt`Go to ${label}`, icon, keys: ["Mod", "Shift", n], words: ["screen", "open"], run: go(screen) }));

    const models: Entry[] = (catalog ? (modelsFor(catalog) as ModelInfo[]) : []).map((m) => {
      const block = codes.indexOf(m.block);
      const inUse = preset?.blocks[block]?.fxid === m.fxid;
      return {
        id: `model:${m.fxid}`,
        search: { primary: m.title, secondary: [m.block, m.name, m.type, m.origin ?? ""] },
        verb: `set ${m.block} model`,
        blocked: inUse ? undefined : preset && connected ? pedal : needsPedal,
        run: () => {
          close();
          if (inUse) return useUi.getState().focusRig({ block, picker: false });
          useDevice
            .getState()
            .setModel(block, m.fxid)
            .then(() => useUi.getState().focusRig({ block, picker: false }))
            .catch((e) => notifyError(lt`Couldn't set ${m.title}`, e));
        },
        render: (ranges) => (
          <>
            <BlockChip code={m.block} />
            <span className="flex min-w-0 flex-1 flex-col">
              <Name text={m.title} ranges={ranges} className="font-semibold" />
              <span className="truncate text-xs text-silkscreen-3">{m.origin ?? m.type}</span>
            </span>
            {inUse ? <Badge><Trans>In use</Trans></Badge> : <Hint>{connected && preset ? lt`Set on ${m.block}` : needsPedal}</Hint>}
          </>
        ),
      };
    });

    // Roles by the model's block layout: a SnapTone loads into its slot's capture block (NS, or AMP/DST on the GP-200)
    const roleOf = (code: string) => profile.blocks.indexOf(code);
    const CAB = roleOf("CAB");
    const tones: Entry[] = [
      ...(snapTones ?? []).map((t) => {
        const fxid = (profile.snapTone.fxidBase + t.slot) >>> 0;
        const capture = roleOf(profile.captureBlock(t.slot));
        return {
          id: `snaptone:${t.slot}`,
          search: { primary: t.name, secondary: ["SnapTone", profile.captureBlock(t.slot), "capture", "nam"], slot: t.slot },
          verb: `set ${profile.captureBlock(t.slot)} model`,
          blocked: preset && connected ? pedal : needsPedal,
          run: () => {
            close();
            useDevice
              .getState()
              .setModel(capture, fxid)
              .then(() => useUi.getState().focusRig({ block: capture, picker: false }))
              .catch((e) => notifyError(lt`Couldn't load ${t.name}`, e));
          },
          render: (ranges: readonly Range[]) => (
            <>
              <AudioWaveform className="size-4 text-silkscreen-3" aria-hidden />
              <Name text={t.name} ranges={ranges} className="flex-1" />
              <Hint>{snapToneLabel(profile.key, t.slot)}</Hint>
            </>
          ),
        } satisfies Entry;
      }),
      ...(userIRs ?? []).map(
        (t) =>
          ({
            id: `ir:${t.slot}`,
            search: { primary: t.name, secondary: ["IR", "CAB", "impulse"], slot: t.slot + 1 },
            verb: "open CAB",
            run: () => {
              close();
              useUi.getState().focusRig({ block: CAB, picker: true });
            },
            render: (ranges: readonly Range[]) => (
              <>
                <Speaker className="size-4 text-silkscreen-3" aria-hidden />
                <Name text={t.name} ranges={ranges} className="flex-1" />
                <Hint><Trans>User IR</Trans> {t.slot + 1}</Hint>
              </>
            ),
          }) satisfies Entry,
      ),
      actionEntry({ id: "tone3000", label: lt`Browse TONE3000`, icon: ExternalLink, hint: lt`Opens the tone picker`, words: ["nam", "capture", "ir", "download"], run: cmd("browse-tone3000") }),
    ];

    return [
      { heading: lt`Presets on pedal`, entries: presets, idle: 3, limit: 8 },
      { heading: lt`Models`, entries: models, limit: 6 },
      { heading: lt`Actions`, entries: actions, idle: 4, limit: 6 },
      { heading: lt`Tones`, entries: tones, idle: 3, limit: 5 },
      { heading: lt`Go to`, entries: screens, limit: 5 },
    ];
  }, [names, slot, connected, unsaved, preset, lastDevice, profile, snapTones, userIRs, busy, recent, close]);
}

/** Ranked, grouped results for `query` (groups ordered by their best hit while typing). */
function useResults(groups: Group[], query: string) {
  const bodies = useLibrary((s) => s.bodies);
  const preset = useDevice((s) => s.preset);
  const profile = useProfile();
  return useMemo(() => {
    const q = query.trim();
    if (!q) {
      return groups
        .filter((g) => g.idle)
        .map((g) => {
          const entries = g.entries.filter((e) => !e.id.startsWith("action:tone3000")).slice(0, g.idle! - (g.heading === "Tones" ? 1 : 0));
          // Browse TONE3000 always closes the Tones group.
          if (g.heading === "Tones") entries.push(g.entries[g.entries.length - 1]);
          return { heading: g.heading, hits: entries.map((e) => ({ entry: e, ranges: [] as Range[] })), best: 0 };
        })
        .filter((g) => g.hits.length);
    }
    const ranked = groups
      .map((g) => {
        const hits = rank(q, g.entries, (e) => e.search, g.limit).map((h) => ({ entry: h.item, ranges: h.match.ranges, score: h.match.score }));
        return { heading: g.heading, hits, best: hits[0]?.score ?? -Infinity };
      })
      .filter((g) => g.hits.length)
      .sort((a, b) => b.best - a.best);
    // Models matched by name → presets on the pedal that use them (bodies from the last backup/read, plus the live preset).
    const models = ranked.find((g) => g.heading === "Models");
    const presetGroup = groups.find((g) => g.heading === "Presets on pedal");
    const named = models?.hits.filter((h) => h.ranges.length) ?? [];
    if (models && presetGroup && named.length) {
      const byFxid = new Map(named.map((h) => [Number(h.entry.id.slice("model:".length)), h]));
      const uses: { entry: Entry; ranges: Range[]; score: number }[] = [];
      for (const e of presetGroup.entries) {
        const slot = Number(e.id.slice("preset:".length));
        const fx = preset?.slot === slot ? preset.blocks.map((b) => b.fxid) : bodies[slot] ? blockFxids(bodies[slot].prst) : [];
        const fxid = fx.find((f) => byFxid.has(f));
        if (fxid === undefined) continue;
        const hit = byFxid.get(fxid)!;
        const title = hit.entry.search.primary;
        uses.push({
          entry: {
            ...e,
            id: `uses:${slot}`,
            render: () => (
              <>
                <span className="min-w-5 shrink-0 font-semibold text-silkscreen-3 tabular-nums">{profile.slotLabel(slot)}</span>
                <span className="flex-1 truncate">{e.search.primary}</span>
                <span className="shrink-0 text-xs text-silkscreen-3">
                  <Name text={title} ranges={hit.ranges} />
                </span>
              </>
            ),
          },
          ranges: [],
          score: hit.score,
        });
      }
      if (uses.length) {
        const amps = named.every((h) => h.entry.verb === "set AMP model");
        uses.sort((a, b) => Number(a.entry.id.slice(5)) - Number(b.entry.id.slice(5)));
        ranked.splice(ranked.indexOf(models) + 1, 0, { heading: lt`Presets on pedal that use ${amps ? lt`these amps` : lt`these models`}`, hits: uses.slice(0, 8), best: models.best });
      }
    }
    return ranked;
  }, [groups, query, bodies, preset, profile]);
}

/** Command palette: Ctrl/Cmd K, title-bar Search, menu View › Command palette. */
export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="top-[14vh] w-[560px] max-w-[calc(100vw-48px)] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[560px]">
        <DialogTitle className="sr-only"><Trans>Command palette</Trans></DialogTitle>
        <DialogDescription className="sr-only"><Trans>Search presets, models, tones and actions</Trans></DialogDescription>
        {open && <PaletteBody close={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function PaletteBody({ close }: { close: () => void }) {
  const [query, setQuery] = useState("");
  const [value, setValue] = useState("");
  const groups = useGroups(close);
  const results = useResults(groups, query);
  const all = results.flatMap((g) => g.hits);
  const active = all.find((h) => h.entry.id === value)?.entry ?? all.find((h) => !h.entry.blocked)?.entry;

  return (
    <CommandPrimitive shouldFilter={false} onValueChange={setValue} loop label={lt`Command palette`} className="flex flex-col">
      <div className="flex h-12 items-center gap-2.5 border-b border-seam px-4 text-silkscreen-3">
        <Search className="size-4 shrink-0" aria-hidden />
        <CommandPrimitive.Input
          value={query}
          onValueChange={setQuery}
          placeholder={lt`Search presets, models, tones and actions`}
          aria-label={lt`Search`}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-silkscreen outline-none placeholder:text-silkscreen-4"
        />
        <Keys keys={["Esc"]} />
      </div>
      <CommandPrimitive.List className="h-[min(476px,calc(100vh-14vh-140px))] scroll-py-2 overflow-y-auto px-2 pt-1 pb-2">
        <CommandPrimitive.Empty className="px-2 py-10 text-center text-[13px] text-pretty text-silkscreen-3">
          <Trans>No matches for “{query.trim()}”. Try a model name, a slot number or the amp it's based on.</Trans>
        </CommandPrimitive.Empty>
        {results.map((g) => (
          <CommandPrimitive.Group
            key={g.heading}
            heading={g.heading}
            className="[&+&]:mt-1 [&+&]:border-t [&+&]:border-seam [&+&]:pt-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-silkscreen-3"
          >
            {g.hits.map(({ entry, ranges }) => (
              <CommandPrimitive.Item
                key={entry.id}
                value={entry.id}
                disabled={!!entry.blocked}
                onSelect={entry.run}
                className={cn(
                  "group flex min-h-[34px] cursor-default items-center gap-2.5 rounded-sm px-2 py-1 text-[13px] text-silkscreen outline-none select-none data-[disabled=true]:text-silkscreen-3 data-[selected=true]:bg-white/10",
                  entry.id.startsWith("model:") && "min-h-12",
                )}
              >
                {entry.render(ranges)}
              </CommandPrimitive.Item>
            ))}
          </CommandPrimitive.Group>
        ))}
      </CommandPrimitive.List>
      <div className="flex min-h-9 items-center gap-4 border-t border-seam px-4 py-1.5 text-[11px] text-silkscreen-3">
        <span className="flex items-center gap-1.5">
          <Keys keys={["↑"]} />
          <Keys keys={["↓"]} />
          <Trans>move</Trans>
        </span>
        {active && (
          <span className="flex items-center gap-1.5">
            <Keys keys={["Enter"]} />
            {active.verb}
          </span>
        )}
        <span className="flex-1" />
        <span>{query.trim() ? lt`${all.length} result${all.length === 1 ? "" : "s"}` : lt`Type a model, slot number or tone`}</span>
      </div>
    </CommandPrimitive>
  );
}
