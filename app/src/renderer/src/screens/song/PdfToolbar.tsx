import { Button } from "@/components/ui/button";
import { ANNOTATION_COLOURS, type AnnotationTool } from "@/song/performance/pdf/annotations";
import type { ChartLayout } from "@/song/performance/pdf/layout";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/** The tools a performer can pick on the PDF. Annotation tools are left out in stage mode, where the chart is read only. */
const TOOLS: { tool: AnnotationTool; label: string }[] = [
  { tool: "pen", get label() { return t`Pen`; } },
  { tool: "highlighter", get label() { return t`Highlighter`; } },
  { tool: "text", get label() { return t`Text note`; } },
];

export interface PdfToolbarProps {
  layout: ChartLayout;
  onLayout(layout: ChartLayout): void;
  page: number;
  pages: number;
  onPage(direction: -1 | 1): void;
  /** Whether annotation and page-turn editing is offered (not in stage mode). */
  editing: boolean;
  tool: AnnotationTool;
  onTool(tool: AnnotationTool): void;
  colour: string;
  onColour(colour: string): void;
  onUndo(): void;
  onClearPage(): void;
  turns: number;
  onTurnNow(): void;
  onClearTurns(): void;
}

/** The PDF's controls: the layout, the page, the annotation tools and the page turns. Plain buttons, sized to read on a stand. */
export function PdfToolbar(props: PdfToolbarProps) {
  const { layout, page, pages, editing, tool, colour } = props;
  return (
    <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 text-sm" aria-label={t`PDF chart controls`}>
      <Button variant="outline" aria-pressed={layout === "scroll"} onClick={() => props.onLayout("scroll")}>
        <Trans>Scroll</Trans>
      </Button>
      <Button variant="outline" aria-pressed={layout === "page"} onClick={() => props.onLayout("page")}>
        <Trans>Page</Trans>
      </Button>
      <Button variant="outline" aria-label={t`Previous page`} disabled={page <= 1} onClick={() => props.onPage(-1)}>
        <Trans>Previous</Trans>
      </Button>
      <Trans><span className="tabular-nums text-silkscreen-3" aria-live="polite">
        Page {page} of {pages}
      </span></Trans>
      <Button variant="outline" aria-label={t`Next page`} disabled={page >= pages} onClick={() => props.onPage(1)}>
        <Trans>Next</Trans>
      </Button>
      {editing && (
        <>
          <span className="ml-2 text-silkscreen-3"><Trans>Mark:</Trans></span>
          {TOOLS.map((option) => (
            <Button key={option.tool} variant="outline" aria-pressed={tool === option.tool} onClick={() => props.onTool(tool === option.tool ? "none" : option.tool)}>
              {option.label}
            </Button>
          ))}
          <div className="flex items-center gap-1" role="group" aria-label={t`Mark colour`}>
            {ANNOTATION_COLOURS.map((value) => (
              <button
                key={value}
                type="button"
                aria-label={t`Colour ${value}`}
                aria-pressed={colour === value}
                onClick={() => props.onColour(value)}
                className={"size-6 rounded-full border border-seam " + (colour === value ? "ring-2 ring-sky-400" : "")}
                style={{ background: value }}
              />
            ))}
          </div>
          <Button variant="outline" onClick={props.onUndo}>
            <Trans>Undo mark</Trans>
          </Button>
          <Button variant="outline" onClick={props.onClearPage}>
            <Trans>Clear page marks</Trans>
          </Button>
          <span className="ml-2 text-silkscreen-3"><Trans>Page turns: {props.turns}</Trans></span>
          <Button variant="outline" onClick={props.onTurnNow}>
            <Trans>Turn page at this time</Trans>
          </Button>
          <Button variant="outline" disabled={!props.turns} onClick={props.onClearTurns}>
            <Trans>Clear page turns</Trans>
          </Button>
        </>
      )}
    </div>
  );
}
