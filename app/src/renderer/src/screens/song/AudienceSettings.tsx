import { SettingsCard } from "@/components/ui/settings-card";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { host } from "@/host";
import { AUDIENCE_LIMITS, AUDIENCE_ROTATIONS, type AudienceRotation } from "@shared/audience";
import type { AudienceStatus } from "@shared/host/audience";
import { useAudienceSettings } from "@/song/performance/audience-settings";
import { HelpNote } from "@/components/ui/help-note";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/** The audience display's controls and status: where it shows, how it is laid out, and blackout (spec 43). */
export function AudienceSettings() {
  const settings = useAudienceSettings();
  const [status, setStatus] = useState<AudienceStatus | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!host.audience) return;
    let live = true;
    void host.audience.status().then((next) => live && setStatus(next));
    const stop = host.audience.onStatus((next) => setStatus(next));
    return () => {
      live = false;
      stop();
    };
  }, []);
  if (!host.audience) return null;
  const run = (action: Promise<AudienceStatus>) => {
    setError("");
    action.then(setStatus).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  const onDisplay = status?.windowing === "display";
  return (
    <SettingsCard
      title={t`Audience display`}
      summary={status?.open ? t`Audience display is on` : t`Audience display is off`}
      storageKey="audience"
      defaultOpen={false}
      actions={
        <>
          {status?.open ? (
            <Button variant="outline" onClick={() => run(host.audience.close())}>
              <Trans>Close audience display</Trans>
            </Button>
          ) : (
            <Button variant="outline" onClick={() => run(host.audience.open())}>
              <Trans>Open audience display</Trans>
            </Button>
          )}
          <Button
            variant={settings.blackout ? "default" : "outline"}
            aria-pressed={settings.blackout}
            onClick={() => settings.update({ blackout: !settings.blackout })}
          >
            {settings.blackout ? t`Blackout on` : t`Blackout`}
          </Button>
        </>
      }
    >
      <p role="status" className="text-sm text-silkscreen-2">
        {error || status?.message || t`Checking the audience display…`}
      </p>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {onDisplay && (
          <label className="flex items-center gap-2">
            <Trans>Show on</Trans>
            <Select
              value={status?.displayId === null || status?.displayId === undefined ? "window" : String(status.displayId)}
              onValueChange={(value) => run(host.audience.chooseDisplay(value === "window" ? null : Number(value)))}
            >
              <SelectTrigger aria-label={t`Audience display location`} className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="window"><Trans>A window</Trans></SelectItem>
                {status?.displayId !== null && status?.displayId !== undefined && !status.displays.some((d) => d.id === status.displayId) && (
                  <SelectItem value={String(status.displayId)}><Trans>Chosen display (not connected)</Trans></SelectItem>
                )}
                {status?.displays.map((display) => (
                  <SelectItem key={display.id} value={String(display.id)}>
                    {`${display.label}${display.primary ? " (main screen)" : ""} · ${display.width}×${display.height}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
        <label className="flex items-center gap-2">
          <Checkbox
            aria-label={t`Black between songs`}
            checked={settings.blackBetweenSongs}
            onCheckedChange={(checked) => settings.update({ blackBetweenSongs: checked === true })}
          />
          <Trans>Black between songs</Trans>
        </label>
        <label className="flex items-center gap-2">
          <Checkbox
            aria-label={t`Show chords on the audience display`}
            checked={settings.showChords}
            onCheckedChange={(checked) => settings.update({ showChords: checked === true })}
          />
          <Trans>Show chords</Trans>
        </label>
        <label className="flex items-center gap-2">
          <Trans>Rotation</Trans>
          <Select value={String(settings.rotation)} onValueChange={(value) => settings.update({ rotation: Number(value) as AudienceRotation })}>
            <SelectTrigger aria-label={t`Audience display rotation`} className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIENCE_ROTATIONS.map((turn) => (
                <SelectItem key={turn} value={String(turn)}>
                  {turn}°
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex min-w-56 flex-1 items-center gap-3">
          <Trans>Text size {Math.round(settings.fontScale * 100)}%</Trans>
          <Slider
            aria-label={t`Audience text size`}
            min={Math.round(AUDIENCE_LIMITS.fontMin * 100)}
            max={Math.round(AUDIENCE_LIMITS.fontMax * 100)}
            step={5}
            value={[Math.round(settings.fontScale * 100)]}
            onValueChange={([percent]) => settings.update({ fontScale: percent / 100 })}
          />
        </label>
      </div>
      <HelpNote>
        <p><Trans>The audience window shows the lyrics and chords of the song on screen, or its PDF page, and follows playback. Closing it does not stop playback.</Trans></p>
      </HelpNote>
    </SettingsCard>
  );
}
