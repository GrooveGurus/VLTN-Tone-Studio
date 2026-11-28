import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSongLibrary } from "@/song/library";
import type { LibrarySong } from "@shared/song-library";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

const field = "rounded border border-seam bg-transparent p-2";

/** Splits a comma-separated keyword box into clean, unique keywords. */
export const parseKeywords = (text: string): string[] => [
  ...new Set(
    text
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean),
  ),
];

/** The details of one song: its key, year, keywords and notes. Blank key, year or notes clear the field. */
export function SongDetails({ song }: { song: LibrarySong }) {
  const library = useSongLibrary();
  const [key, setKey] = useState(song.key ?? "");
  const [year, setYear] = useState(song.year ? String(song.year) : "");
  const [keywords, setKeywords] = useState((song.keywords ?? []).join(", "));
  const [notes, setNotes] = useState(song.notes ?? "");
  const yearNumber = year.trim() ? Number(year) : null;
  const yearOk = yearNumber === null || (Number.isInteger(yearNumber) && yearNumber >= 1000 && yearNumber <= 2999);
  const save = () =>
    void library.organiseSongs([song.id], {
      key: key.trim() || null,
      year: yearNumber,
      keywords: parseKeywords(keywords),
      notes: notes.trim() || null,
    });
  return (
    <div className="grid gap-2 rounded border border-seam p-3 sm:grid-cols-2" aria-label={t`Details for ${song.title}`}>
      <input aria-label={t`Song key`} placeholder={t`Key, such as A minor`} className={field} value={key} onChange={(e) => setKey(e.target.value)} />
      <input
        aria-label={t`Song year`}
        placeholder={t`Year`}
        inputMode="numeric"
        className={field}
        value={year}
        aria-invalid={!yearOk}
        onChange={(e) => setYear(e.target.value)}
      />
      <input
        aria-label={t`Keywords`}
        placeholder={t`Keywords, comma separated`}
        className={field + " sm:col-span-2"}
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
      />
      <textarea
        aria-label={t`Song notes`}
        placeholder={t`Notes`}
        className={field + " sm:col-span-2"}
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button disabled={!yearOk || library.busy} onClick={save}>
          <Trans>Save details</Trans>
        </Button>
        {!yearOk && <span className="text-sm text-red-400"><Trans>Enter a year from 1000 to 2999, or leave it blank.</Trans></span>}
      </div>
    </div>
  );
}
