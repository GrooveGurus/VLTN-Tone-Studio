import type { LucideIcon } from "lucide-react";
import { AudioLines, AudioWaveform, Cable, LibraryBig, ListMusic, Settings2, Usb } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNav, type Screen } from "@/state/nav";
import { t } from "@lingui/core/macro";

const ITEMS: { screen: Screen; label: string; icon: LucideIcon }[] = [
  { screen: "rig", get label() { return t`Rig`; }, icon: Cable },
  { screen: "library", get label() { return t`Library`; }, icon: LibraryBig },
  { screen: "setlist", get label() { return t`Setlist`; }, icon: ListMusic },
  { screen: "tones", get label() { return t`Tones`; }, icon: AudioWaveform },
  { screen: "device", get label() { return t`Device`; }, icon: Usb },
  { screen: "song", get label() { return t`Song`; }, icon: AudioLines },
];

/**
 * Floating glass rail. The capture editor is reached from Tones, so it highlights
 * Tones; Device › Settings highlights Settings.
 */
export function Rail() {
  const screen = useNav((s) => s.screen);
  const param = useNav((s) => s.param);
  const go = useNav((s) => s.go);
  const settings = screen === "device" && param === "settings";
  const current = settings ? null : screen === "capture" ? "tones" : screen;
  return (
    <nav aria-label={t`Main`} className="glass-float mb-3 ml-3 flex flex-col gap-0.5 rounded-xl py-2.5">
      {ITEMS.map(({ screen: s, label, icon: Icon }) => (
        <RailItem key={s} label={label} active={current === s} onClick={() => go(s)}>
          <Icon className="size-5" aria-hidden />
        </RailItem>
      ))}
      <span className="flex-1" />
      {/* The rail is narrow: its own message, so a translation can be shorter than the Settings page title. */}
      <RailItem label={t({ message: "Settings", context: "rail" })} active={settings} onClick={() => go("device", "settings")}>
        <Settings2 className="size-5" aria-hidden />
      </RailItem>
    </nav>
  );
}

function RailItem({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "mx-2 flex flex-col items-center gap-1.5 rounded-lg pt-2.5 pb-2 text-[11px] font-medium text-silkscreen-3 transition-colors hover:bg-white/6 hover:text-silkscreen",
        active && "bg-white/14 text-silkscreen shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] hover:bg-white/14",
      )}
    >
      {children}
      {label}
    </button>
  );
}
