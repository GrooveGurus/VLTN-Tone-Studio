import { useEffect, useState, type ReactNode } from "react";
import { FolderOpen, LogOut, Package } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { notifyError } from "@/app/notify";
import { host, isElectron } from "@/host";
import { useNav } from "@/state/nav";
import { loadAccount, setAppKey, signOut, useTones } from "@/screens/tones/store";
import { listNames } from "@shared/devices";
import { BACKUP_RETENTIONS, RETENTION_LABELS } from "@shared/backup-retention";
import { useAppSettings } from "./settings-store";
import { OldLibraryCopy } from "./OldLibraryCopy";
import { useDevice, usePedalName, useProfile } from "@/state/device";
import { EXPERIMENTAL_FEATURES } from "@/state/device-model";
import { SUPPORTED_DEVICE_KEYS } from "@/state/driver/types";
import { checkForUpdates, downloadUpdate, installUpdate, openReleasePage, useUpdate } from "@/app/updates";
import { LOCALES, localeFor, useLocale, type LocaleChoice } from "@/i18n";
import { t as lt } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/** Settings (`?screen=device&param=settings`): how Tone Studio behaves on this computer. */
export function SettingsView() {
  const { settings, loaded, load, patch } = useAppSettings();
  const go = useNav((s) => s.go);
  const profile = useProfile();
  // Nothing to unlock on the connected or remembered pedal (the GP-5 lacks the GP-50's commands): the switch is dimmed.
  const nothingToUnlock = profile.key === "gp5" || Object.keys(EXPERIMENTAL_FEATURES[profile.family]).length === 0;
  const pedal = usePedalName();

  useEffect(() => {
    void load()
      .then(() => useDevice.getState().setGp50Extras(useAppSettings.getState().settings.gp50Extras))
      .catch((e) => notifyError(lt`Couldn't read the settings`, e));
    void loadAccount();
  }, [load]);

  const save = (p: Parameters<typeof patch>[0]) => void patch(p).catch((e) => notifyError(lt`Couldn't save the setting`, e));

  return (
    <div className="h-full overflow-auto">
      <div className="flex max-w-[920px] flex-col gap-6 px-7 pt-[22px] pb-8">
        <div>
          <h1 className="text-[32px] leading-[1.1] font-bold tracking-[-0.02em] text-balance"><Trans>Settings</Trans></h1>
          <p className="mt-2 text-pretty text-silkscreen-3">
            <Trans>How Tone Studio behaves on this computer. Settings stored on the pedal itself are on the{" "}</Trans>
            <button type="button" className="text-silkscreen-2 underline underline-offset-2 hover:text-silkscreen" onClick={() => go("device")}>
              <Trans>Device</Trans>
            </button><Trans>{" "}
            page.</Trans>
          </p>
        </div>

        <LanguageSection />

        <Section title={lt`Editing`}>
          <Row label={lt`Show knob values`} description={lt`Print each knob's value under its label on the gear, not only while you turn it.`}>
            <Switch checked={settings.showValues} disabled={!loaded} onCheckedChange={(v) => save({ showValues: v })} aria-label={lt`Show knob values`} />
          </Row>
          <Row label={lt`Back up before every write`} description={lt`Before the app saves, renames or writes a slot, it copies what is in that slot now into Replaced presets.`}>
            <Switch checked={settings.backupBeforeWrite} disabled={!loaded} onCheckedChange={(v) => save({ backupBeforeWrite: v })} aria-label={lt`Back up before every write`} />
          </Row>
          {/* Pruning runs in the desktop app, where the backups folder is. */}
          {isElectron && (
            <Row
              label={lt`Keep backups`}
              description={
                "After each backup, the older backups of that pedal move to the Trash. " +
                "Pinned backups are never moved, and backups of other pedals are left alone."
              }
            >
              <Select
                value={settings.backupRetention}
                disabled={!loaded}
                onValueChange={(v) => {
                  const retention = BACKUP_RETENTIONS.find((r) => r === v);
                  if (retention) save({ backupRetention: retention });
                }}
              >
                <SelectTrigger aria-label={lt`Keep backups`} className="w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BACKUP_RETENTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {RETENTION_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          )}
        </Section>

        <Section title={lt`Pedal connection`}>
          <PortPatternRow value={settings.portPattern} disabled={!loaded} onSave={(portPattern) => save({ portPattern })} />
          {/* Only Windows and macOS builds read anything from the Suite install (the SnapTone test signal). */}
          {isElectron && host.platform !== "linux" && (
            <SuitePathRow value={settings.suitePathPicked ? settings.valetonSuitePath : null} disabled={!loaded} />
          )}
          {/* The setting keeps its stored key (gp50Extras); EXPERIMENTAL_FEATURES lists what it unlocks per family. */}
          <Row
            label={lt`Experimental pedal commands`}
            description={lt`${nothingToUnlock ? lt`Nothing to turn on for the ${pedal}. ` : ""}Lets Tone Studio use commands that are known from Valeton's software but not yet tested on a real pedal. GP-50: EXP settings, live tempo, footswitch and chain changes without saving, and deleting, copying, moving and exporting presets inside the pedal. GP-200, GP-200LT and GP-200JR: the Global EQ. The GP-5 has none. Back up your pedal first. The simulator always has them.`}
          >
            <Switch
              checked={settings.gp50Extras}
              disabled={!loaded || nothingToUnlock}
              onCheckedChange={(v) => {
                useDevice.getState().setGp50Extras(v);
                // A failed save restores the previous value; the connected session follows it back.
                void patch({ gp50Extras: v }).catch((e) => {
                  useDevice.getState().setGp50Extras(useAppSettings.getState().settings.gp50Extras);
                  notifyError(lt`Couldn't save the setting`, e);
                });
              }}
              aria-label={lt`Experimental pedal commands`}
            />
          </Row>
        </Section>

        <OldLibraryCopy />

        <Section title={lt`TONE3000 account`}>
          <AppKeyRow />
          <AccountRow />
        </Section>

        <Section title={lt`About`}>
          {isElectron ? (
            <>
              <UpdateRow />
              <Row label={lt`Check for updates automatically`} description={lt`Ask GitHub for a new release when the app starts and every six hours, and offer to install it. Nothing is downloaded until you choose to.`}>
                <Switch
                  checked={settings.checkForUpdates}
                  disabled={!loaded}
                  onCheckedChange={(v) => save({ checkForUpdates: v })}
                  aria-label={lt`Check for updates automatically`}
                />
              </Row>
            </>
          ) : (
            <Row label={lt`Tone Studio in the browser`} description={lt`Backups stay in this browser. Valeton Suite and folders on disk need the desktop app.`} />
          )}
        </Section>
        <OldLibraryCopy />
      </div>
    </div>
  );
}

/** The editor's language: the computer's (the default) or one with a translation; the screen changes at once. */
function LanguageSection() {
  const choice = useLocale((s) => s.choice);
  const system = LOCALES[localeFor(typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language])];
  const pick = (v: string) => {
    if (v !== "system" && !Object.hasOwn(LOCALES, v)) return;
    void useLocale
      .getState()
      .setChoice(v as LocaleChoice)
      .catch((e) => notifyError(lt`Couldn't change the language`, e));
  };
  return (
    <Section title={lt`Language`}>
      <Row label={lt`Language`} description={lt`The language of Tone Studio's screens. Effect names and the pedal's own labels (CTRL, TAP, SAVE) stay as on the pedal.`}>
        <Select value={choice} onValueChange={pick}>
          <SelectTrigger aria-label={lt`Language`} className="w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">{lt`Same as this computer (${system})`}</SelectItem>
            {Object.entries(LOCALES).map(([key, name]) => (
              <SelectItem key={key} value={key} lang={key}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 text-sm font-semibold text-silkscreen-2">{title}</h2>
      <div className="rounded-lg bg-card shadow-[0_0_0_1px_var(--seam)]">{children}</div>
    </section>
  );
}

function Row({ label, description, children }: { label: ReactNode; description: ReactNode; children?: ReactNode }) {
  return (
    <div className="grid grid-cols-[280px_minmax(0,1fr)] items-center gap-6 border-b px-5 py-3.5 last:border-b-0">
      <div>
        <b className="block font-semibold">{label}</b>
        <span className="block text-sm text-pretty text-silkscreen-3">{description}</span>
      </div>
      {children && <div className="flex min-w-0 items-center justify-end gap-2">{children}</div>}
    </div>
  );
}

/** Version, the update state from main and the one action that fits it. */
function UpdateRow() {
  const snap = useUpdate((s) => s.snapshot);
  // Same jobs main refuses to interrupt (they report taskbar progress): every long job except reading names.
  const busyJob = useDevice((s) => !!s.busy && s.busy.kind !== "sync");
  const state = snap?.state ?? { status: "idle" as const };
  const installs = snap?.mode === "install";
  const description = (() => {
    switch (state.status) {
      case "idle":
        return lt`Not checked for updates yet.`;
      case "checking":
        return lt`Checking GitHub for a new release…`;
      case "current":
        return lt`Up to date. Checked ${new Date(state.checkedAt).toLocaleString()}.`;
      case "available":
        return installs
          ? lt`Version ${state.version} is available. Download it here; it installs when you restart.`
          : lt`Version ${state.version} is available. This build can't install updates by itself: download it from the release page.`;
      case "downloading":
        return lt`Downloading version ${state.version}: ${state.percent}%.`;
      case "ready":
        return busyJob
          ? lt`Version ${state.version} is downloaded and checked. Restart when the pedal finishes its current job, or it installs when you quit.`
          : lt`Version ${state.version} is downloaded and checked. It installs when you restart or quit Tone Studio.`;
      case "error":
        return state.message;
    }
  })();
  return (
    <Row label={lt`Tone Studio ${snap?.current ?? ""}`.trim()} description={<span aria-live="polite">{description}</span>}>
      {(state.status === "available" || state.status === "ready") && (
        <Button variant="ghost" onClick={() => void openReleasePage(state.version)}>
          <Trans>What's new</Trans>
        </Button>
      )}
      {state.status === "available" && installs && <Button onClick={() => void downloadUpdate()}><Trans>Download</Trans></Button>}
      {state.status === "available" && !installs && <Button onClick={() => void openReleasePage(state.version)}><Trans>Release page</Trans></Button>}
      {state.status === "ready" && (
        <Button disabled={busyJob} onClick={() => void installUpdate()}>
          <Trans>Restart now</Trans>
        </Button>
      )}
      {state.status !== "available" && state.status !== "ready" && (
        <Button variant="outline" disabled={state.status === "checking" || state.status === "downloading"} onClick={() => void checkForUpdates()}>
          <Trans>Check now</Trans>
        </Button>
      )}
    </Row>
  );
}

function PortPatternRow({ value, disabled, onSave }: { value: string | null; disabled: boolean; onSave: (v: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  const dirty = draft.trim() !== (value ?? "");
  return (
    <Row
      label={lt`MIDI port name`}
      description={lt`Leave empty to find the pedal automatically (any port with ${listNames(SUPPORTED_DEVICE_KEYS)} in its name). Enter part of a port name to use that port instead, for example a virtual pedal.`}
    >
      <form
        className="flex min-w-0 flex-1 items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft.trim() || null);
        }}
      >
        <Input
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={lt`Automatic`}
          aria-label={lt`MIDI port name`}
          spellCheck={false}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="outline" disabled={disabled || !dirty}>
          <Trans>Save</Trans>
        </Button>
        {value && (
          <Button type="button" variant="ghost" onClick={() => onSave(null)}>
            <Trans>Automatic</Trans>
          </Button>
        )}
      </form>
    </Row>
  );
}

function SuitePathRow({ value, disabled }: { value: string | null; disabled: boolean }) {
  const load = useAppSettings((s) => s.load);
  const pick = async () => {
    try {
      // The main process stores the chosen path itself (device:pickSuitePath), so reload instead of saving it here.
      const path = await host.device.pickSuitePath();
      if (path) await load();
    } catch (e) {
      notifyError(lt`Couldn't choose Valeton Suite`, e);
    }
  };
  return (
    <Row
      label={lt`Valeton Suite`}
      description={lt`Tone Studio takes Valeton's SnapTone test signal from this install. Firmware updates for the pedal also run in Suite.`}
    >
      <div className="flex h-[34px] min-w-0 flex-1 items-center gap-2 rounded-pill bg-well px-3.5 shadow-[inset_0_0_0_1px_var(--seam-strong)]">
        <Package className="size-3.5 shrink-0 text-silkscreen-3" aria-hidden />
        <span className={value ? "truncate text-silkscreen" : "truncate text-silkscreen-3"} title={value ?? undefined}>
          {value ?? lt`Not chosen`}
        </span>
      </div>
      <Button variant="outline" disabled={disabled} onClick={() => void pick()}>
        {value ? lt`Change` : lt`Choose`}
      </Button>
      {value && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={lt`Open Valeton Suite`}
          title={lt`Open Valeton Suite`}
          onClick={() => void host.app.launchSuite().catch((e) => notifyError(lt`Couldn't open Valeton Suite`, e))}
        >
          <FolderOpen aria-hidden />
        </Button>
      )}
    </Row>
  );
}

function AppKeyRow() {
  const account = useTones((s) => s.account);
  const saved = account?.appKey ?? null;
  const [draft, setDraft] = useState(saved ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(saved ?? ""), [saved]);
  const dirty = draft.trim() !== (saved ?? "");
  const disabled = !account || busy;

  const save = async (value: string | null) => {
    setBusy(true);
    try {
      await setAppKey(value);
    } catch (e) {
      notifyError(lt`Couldn't save the TONE3000 app key`, e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Row
      label={lt`App key`}
      description={
        isElectron
          ? lt`Your TONE3000 publishable key (client_id). Get one from your TONE3000 account page. Changing the key signs you out.`
          : lt`Signing in to TONE3000 needs the desktop app.`
      }
    >
      {isElectron ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save(draft.trim() || null);
          }}
        >
          <Input
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={account?.configured && !saved ? lt`Built into this build` : lt`Not set`}
            aria-label={lt`TONE3000 app key`}
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="outline" disabled={disabled || !dirty}>
            <Trans>Save</Trans>
          </Button>
          {saved && (
            <Button type="button" variant="ghost" disabled={disabled} onClick={() => void save(null)}>
              <Trans>Clear</Trans>
            </Button>
          )}
        </form>
      ) : (
        <span className="text-sm text-silkscreen-3"><Trans>Needs the desktop app</Trans></span>
      )}
    </Row>
  );
}

function AccountRow() {
  const go = useNav((s) => s.go);
  const account = useTones((s) => s.account);
  const [confirm, setConfirm] = useState(false);

  const disconnect = async () => {
    try {
      await signOut();
      setConfirm(false);
    } catch (e) {
      notifyError(lt`Couldn't sign out of TONE3000`, e);
    }
  };

  const user = account?.status === "signed-in" ? account.user : null;
  return (
    <Row
      label="TONE3000"
      description={
        <>
          <Trans>Browse and download NAM captures and IRs. Signing in happens on TONE3000's own page.</Trans>
          {account?.insecureStorage && (
            <span className="block"><Trans>No system keyring was found, so the TONE3000 sign-in lasts only this session. Install a keyring to stay signed in.</Trans></span>
          )}
        </>
      }
    >
      {!account ? null : user ? (
        <>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Avatar className="size-8">
              {user.avatar_url && <AvatarImage src={user.avatar_url} alt="" />}
              <AvatarFallback>{(user.display_name ?? user.username).slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <b className="block truncate font-semibold">{user.display_name ?? user.username}</b>
              <Trans><span className="block text-sm text-silkscreen-3">Signed in. Tone downloads go to tones/ in the data folder.</span></Trans>
            </div>
          </div>
          <Button variant="outline" onClick={() => setConfirm(true)}>
            <LogOut aria-hidden />
            <Trans>Disconnect</Trans>
          </Button>
          <Dialog open={confirm} onOpenChange={setConfirm}>
            <DialogContent className="sm:max-w-[440px]">
              <DialogHeader>
                <DialogTitle><Trans>Sign out of TONE3000?</Trans></DialogTitle>
                <DialogDescription><Trans>Downloaded tones stay in your data folder.</Trans></DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost"><Trans>Cancel</Trans></Button>
                </DialogClose>
                <Button onClick={() => void disconnect()}><Trans>Sign out</Trans></Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <>
          <span className="flex-1 text-sm text-silkscreen-3">{account.status === "expired" ? lt`Signed out: the session expired` : lt`Not signed in`}</span>
          <Button variant="outline" onClick={() => go("tones")} disabled={!account.configured}>
            <Trans>Sign in on Tones</Trans>
          </Button>
        </>
      )}
    </Row>
  );
}
