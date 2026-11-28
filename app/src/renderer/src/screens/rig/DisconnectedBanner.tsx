import { PlugZapIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDevice, usePedalName } from "@/state/device";
import { vendorApps } from "@/state/device-model";
import { useNav } from "@/state/nav";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/** Not dismissable, disappears on reconnect. The Rig below shows the last read, read-only. */
export function DisconnectedBanner() {
  const error = useDevice((s) => s.error);
  const pedal = usePedalName();
  const silent = error?.code === "busy" || error?.code === "timeout";
  const editor = vendorApps(useDevice((s) => s.device)).editor;
  return (
    <Alert className="glass mx-7 mt-3 flex w-auto items-center gap-4 rounded-lg border-0 px-4 py-2.5">
      <PlugZapIcon className="size-5 text-led-warn" aria-hidden />
      <div className="min-w-0 flex-1">
        <AlertTitle>{silent ? t`Found the ${pedal}, but it doesn't answer` : t`The ${pedal} isn't connected`}</AlertTitle>
        <AlertDescription className="text-silkscreen-2 [@media(max-height:820px)]:line-clamp-1">
          {silent
            ? t`Another app may be using it. Close ${editor} and try again.`
            : t`Plug it in over USB. If ${editor} is open, close it first because it holds the port.`}
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 [@media(max-height:820px)]:hidden">
            <Trans><span className="text-xs text-silkscreen-3">Works offline</span></Trans>
            <Badge variant="outline"><Trans>Library and backups</Trans></Badge>
            <Badge variant="outline"><Trans>Preset files (.prst)</Trans></Badge>
            <Badge variant="outline"><Trans>NAM and IR files</Trans></Badge>
          </span>
        </AlertDescription>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" onClick={() => useNav.getState().go("library")}>
          <Trans>Open Library</Trans>
        </Button>
        {silent ? (
          <Button onClick={() => void useDevice.getState().connect().catch(() => {})}><Trans>Try again</Trans></Button>
        ) : (
          <Button variant="ghost" onClick={() => useNav.getState().go("device", "troubleshooting")}>
            <Trans>Connection help</Trans>
          </Button>
        )}
      </div>
    </Alert>
  );
}
