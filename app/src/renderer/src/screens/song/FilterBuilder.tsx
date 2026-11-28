import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FILTER_FIELDS, SORT_KEYS, SORT_LABELS, ruleProblem, type FilterField, type FilterOp, type FilterRule, type SmartRules } from "@shared/library-filter";
import type { LibraryFolder } from "@shared/song-library";
import { readRecentFilters, withRecentFilter, writeRecentFilters } from "@/song/recent-filters";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

const field = "rounded border border-seam bg-transparent p-2";

const FIELD_LABELS: Record<FilterField, string> = {
  get title() { return t`Title`; },
  get artist() { return t`Artist`; },
  get notes() { return t`Notes`; },
  get key() { return t`Key`; },
  get keyword() { return t`Keyword`; },
  get colour() { return t`Colour`; },
  get folder() { return t`Folder`; },
  bpm: "BPM",
  get year() { return t`Year`; },
  get playCount() { return t`Play count`; },
  get duration() { return t`Length (seconds)`; },
  get added() { return t`Date added`; },
  get lastPlayed() { return t`Last played`; },
};
const OP_LABELS: Record<FilterOp, string> = {
  get contains() { return t`contains`; },
  get is() { return t`is`; },
  get has() { return t`has`; },
  get in() { return t`is in`; },
  get lt() { return t`is less than`; },
  get gt() { return t`is more than`; },
  get between() { return t`is between`; },
  get before() { return t`is before`; },
  get after() { return t`is after`; },
  get never() { return t`has never happened`; },
};

/** A rule that is new, for a field: its first operator and an empty value of the right kind. */
function newRule(name: FilterField): FilterRule {
  const op = FILTER_FIELDS[name][0];
  if (name === "bpm" || name === "year" || name === "playCount" || name === "duration") return { field: name, op, value: Number.NaN };
  if (name === "folder") return { field: name, op, value: [] };
  if (name === "colour") return { field: name, op, value: "#3b82f6" };
  if (name === "added" || name === "lastPlayed") return { field: name, op, value: "" };
  return { field: name, op, value: "" };
}

/** The kind of input a rule's value takes, so the editor shows the right control. */
function inputKind(rule: FilterRule): "text" | "number" | "range" | "colour" | "date" | "folder" | "none" {
  if (rule.op === "never") return "none";
  if (rule.op === "between") return "range";
  if (rule.field === "colour") return "colour";
  if (rule.field === "folder") return "folder";
  if (rule.field === "added" || rule.field === "lastPlayed") return "date";
  if (rule.field === "bpm" || rule.field === "year" || rule.field === "playCount" || rule.field === "duration") return "number";
  return "text";
}

const numberValue = (value: FilterRule["value"]) => (typeof value === "number" && Number.isFinite(value) ? value : "");
/** The two ends of a range rule, as numbers. A missing end is NaN, which the editor shows as empty. */
const rangeOf = (value: FilterRule["value"]): [number, number] => (Array.isArray(value) ? [Number(value[0]), Number(value[1])] : [Number.NaN, Number.NaN]);

/**
 * Edits a smart playlist's rules, match mode, sort and limit, or a library filter. Every change is passed up as a whole new value, and a
 * rule that cannot run is shown with its problem rather than rejected, so the editor never throws while someone is typing.
 */
export function FilterBuilder({
  value,
  folders,
  onChange,
  showSort = true,
}: {
  value: SmartRules;
  folders: readonly LibraryFolder[];
  onChange(next: SmartRules): void;
  showSort?: boolean;
}) {
  const [recent, setRecent] = useState(readRecentFilters);
  const setRule = (index: number, rule: FilterRule) => onChange({ ...value, rules: value.rules.map((r, i) => (i === index ? rule : r)) });
  const problems = value.rules.map((rule, index) => ({ index, problem: ruleProblem(rule) })).filter((entry) => entry.problem);
  const apply = (filter: SmartRules) => {
    const next = withRecentFilter(recent, filter);
    setRecent(next);
    writeRecentFilters(next);
    onChange(filter);
  };
  return (
    <div className="space-y-3" aria-label={t`Filter`}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm">
          <Trans>Songs that match{" "}</Trans>
          <select aria-label={t`Match`} className={field} value={value.match} onChange={(e) => onChange({ ...value, match: e.target.value as "all" | "any" })}>
            <option value="all"><Trans>all of these rules</Trans></option>
            <option value="any"><Trans>any of these rules</Trans></option>
          </select>
        </label>
      </div>
      {value.rules.map((rule, index) => {
        const kind = inputKind(rule);
        return (
          <div key={index} className="flex flex-wrap items-center gap-2" data-testid="filter-rule">
            <select
              aria-label={t`Rule ${index + 1} field`}
              className={field}
              value={rule.field}
              onChange={(e) => setRule(index, newRule(e.target.value as FilterField))}
            >
              {(Object.keys(FILTER_FIELDS) as FilterField[]).map((name) => (
                <option key={name} value={name}>
                  {FIELD_LABELS[name]}
                </option>
              ))}
            </select>
            <select
              aria-label={t`Rule ${index + 1} operator`}
              className={field}
              value={rule.op}
              onChange={(e) => setRule(index, { ...rule, op: e.target.value as FilterOp, value: rule.op === "between" ? undefined : rule.value })}
            >
              {(FILTER_FIELDS[rule.field] as readonly FilterOp[]).map((op) => (
                <option key={op} value={op}>
                  {OP_LABELS[op]}
                </option>
              ))}
            </select>
            {kind === "text" && (
              <input
                aria-label={t`Rule ${index + 1} value`}
                className={field}
                value={String(rule.value ?? "")}
                onChange={(e) => setRule(index, { ...rule, value: e.target.value })}
              />
            )}
            {kind === "number" && (
              <input
                type="number"
                aria-label={t`Rule ${index + 1} value`}
                className={field}
                value={numberValue(rule.value)}
                onChange={(e) => setRule(index, { ...rule, value: e.target.valueAsNumber })}
              />
            )}
            {kind === "range" && (
              <>
                <input
                  type="number"
                  aria-label={t`Rule ${index + 1} from`}
                  className={field}
                  value={numberValue(rangeOf(rule.value)[0])}
                  onChange={(e) => setRule(index, { ...rule, value: [e.target.valueAsNumber, rangeOf(rule.value)[1]] })}
                />
                <input
                  type="number"
                  aria-label={t`Rule ${index + 1} to`}
                  className={field}
                  value={numberValue(rangeOf(rule.value)[1])}
                  onChange={(e) => setRule(index, { ...rule, value: [rangeOf(rule.value)[0], e.target.valueAsNumber] })}
                />
              </>
            )}
            {kind === "colour" && (
              <input
                type="color"
                aria-label={t`Rule ${index + 1} colour`}
                value={String(rule.value)}
                onChange={(e) => setRule(index, { ...rule, value: e.target.value })}
              />
            )}
            {kind === "date" && (
              <input
                type="date"
                aria-label={t`Rule ${index + 1} date`}
                className={field}
                value={String(rule.value ?? "")}
                onChange={(e) => setRule(index, { ...rule, value: e.target.value })}
              />
            )}
            {kind === "folder" && (
              <select
                aria-label={t`Rule ${index + 1} folder`}
                className={field}
                value={Array.isArray(rule.value) ? (rule.value[0] ?? "") : ""}
                onChange={(e) => setRule(index, { ...rule, value: e.target.value ? [e.target.value] : [] })}
              >
                <option value=""><Trans>Choose a folder…</Trans></option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            )}
            <Button
              variant="outline"
              aria-label={t`Remove rule ${index + 1}`}
              onClick={() => onChange({ ...value, rules: value.rules.filter((_, i) => i !== index) })}
            >
              <Trans>Remove</Trans>
            </Button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={value.rules.length >= 20} onClick={() => onChange({ ...value, rules: [...value.rules, newRule("title")] })}>
          <Trans>Add rule</Trans>
        </Button>
        {showSort && (
          <label className="text-sm">
            <Trans>Sort by{" "}</Trans>
            <select
              aria-label={t`Sort by`}
              className={field}
              value={value.sort}
              onChange={(e) => onChange({ ...value, sort: e.target.value as SmartRules["sort"] })}
            >
              {SORT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        )}
        {showSort && (
          <label className="text-sm">
            <Trans>Limit to{" "}</Trans>
            <input
              type="number"
              aria-label={t`Song limit`}
              placeholder={t`No limit`}
              className={field + " w-24"}
              value={value.limit ?? ""}
              min={1}
              onChange={(e) => onChange({ ...value, limit: e.target.value === "" ? undefined : e.target.valueAsNumber })}
            />
          </label>
        )}
      </div>
      {problems.map(({ index, problem }) => (
        <p key={index} role="alert" className="text-sm text-red-400">
          <Trans>Rule</Trans> {index + 1}: {problem}
        </p>
      ))}
      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Trans><span className="text-silkscreen-3">Recent filters:</span></Trans>
          {recent.map((filter, index) => (
            <Button key={index} variant="outline" onClick={() => apply(filter)}>
              {filter.rules.length ? t`${filter.rules.length} rule${filter.rules.length === 1 ? "" : "s"}` : t`Everything`} · {SORT_LABELS[filter.sort]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
