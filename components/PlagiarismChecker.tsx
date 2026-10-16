"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { Button, Card, FileButton, InlineSegment, ScoreBar, Spinner, textareaClass, Toggle } from "@/components/ui/primitives";
import { downloadPost, errorMessage, pollJson, postFile, postJson, remove, sleep } from "@/lib/api";
import { usePersistentState } from "@/lib/persistentState";
import { countWords } from "@/lib/text";
import { assertUploadSize, DOCUMENT_ACCEPT } from "@/lib/uploads";

const MIN_WORDS = 20;
const MAX_WORDS = 10_000;
const MAX_CHARS = 80_000;
const MAX_POLLS = 240;

type Tier = "high" | "medium" | "low";
type Match = {
  id: string;
  text: string;
  start: number;
  end: number;
  token_count: number;
  percent_similar: number;
  tier: Tier;
  tier_label: string;
  source: { id: string; url: string } | null;
};
type Source = { id: string; url: string; domain: string; percent: number; match_count: number };
type Settings = { exclude_bibliography: boolean; exclude_quotes: boolean; compare_past_scans: boolean };
type Scan = {
  status: "queued" | "processing" | "completed" | "failed";
  scan_id: string;
  title: string;
  progress: number;
  revision: { title: string; similarity_percent: number } | null;
  result?: {
    score: number;
    word_count: number;
    matches: Match[];
    sources: Source[];
    breakdown: { copied: number; paraphrased: number; common: number };
  };
  error?: string;
  provider_pending?: boolean;
  provider_message?: string;
  retry_after_seconds?: number;
};

const SETTINGS: { key: keyof Settings; label: string; description: string }[] = [
  { key: "exclude_bibliography", label: "Exclude references and bibliography", description: "Skip the citation list at the end." },
  { key: "exclude_quotes", label: "Exclude direct quotes", description: "Skip text inside quotation marks." },
  { key: "compare_past_scans", label: "Compare against past scans", description: "Find overlap with documents checked before." },
];

const TIER_STYLES: Record<Tier, string> = {
  high: "bg-red-100 decoration-red-500",
  medium: "bg-amber-100 decoration-amber-500",
  low: "bg-slate-100 decoration-slate-400",
};

export default function PlagiarismChecker() {
  const toast = useToast();
  const [text, setText] = usePersistentState("plagiarism.text", "");
  const [title, setTitle] = usePersistentState("plagiarism.title", "Pasted text");
  const [settings, setSettings] = usePersistentState<Settings>("plagiarism.settings", {
    exclude_bibliography: true,
    exclude_quotes: true,
    compare_past_scans: true,
  });
  const [scan, setScan] = usePersistentState<Scan | null>("plagiarism.scan", null);
  const [phase, setPhase] = usePersistentState<"input" | "progress" | "results">("plagiarism.phase", "input");
  const [notice, setNotice] = useState("");
  const [stalled, setStalled] = useState(false);
  const [busy, setBusy] = useState<"" | "upload" | "report">("");
  const [focused, setFocused] = useState<Match | null>(null);
  const [rewrite, setRewrite] = useState("");
  const [edits, setEdits] = usePersistentState<Record<string, string>>("plagiarism.edits", {});
  const [ignored, setIgnored] = usePersistentState<string[]>("plagiarism.ignored", []);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const pollRun = useRef(0);
  const watchedScan = useRef<string | null>(null);
  const creatingScan = useRef(false);

  useEffect(() => () => void (pollRun.current += 1), []);

  const words = useMemo(() => countWords(text), [text]);
  const result = scan?.result;
  const dirty = Object.keys(edits).length > 0;
  const activeMatches = (result?.matches ?? []).filter((match) => !ignored.includes(match.id));
  const score = useMemo(() => {
    if (!result) return 0;
    const excluded = result.matches
      .filter((match) => ignored.includes(match.id))
      .reduce((sum, match) => sum + match.token_count, 0);
    return Math.max(0, Math.round(result.score - (excluded / Math.max(1, result.word_count)) * 100));
  }, [result, ignored]);

  const poll = useCallback(async (scanId: string) => {
    const run = ++pollRun.current;
    setStalled(false);
    setNotice("Your report is processing. There is no need to submit it again.");
    let delay = 3000;
    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      await sleep(delay);
      if (pollRun.current !== run) return;
      const next = await pollJson<Scan>(`plagiarism-check/${scanId}`);
      if (pollRun.current !== run) return;
      setScan(next);
      delay = next.retry_after_seconds ? Math.min(20_000, next.retry_after_seconds * 1000) : 3000;
      if (next.provider_pending && next.provider_message) setNotice(next.provider_message);
      if (next.status === "completed" && next.result) {
        setPhase("results");
        return;
      }
      if (next.status === "failed") throw new Error(next.error || "The scan failed.");
    }
    throw new Error("The report is taking longer than expected. You can resume checking this scan.");
  }, [setScan, setPhase]);

  // Follows the scan in progress, including one restored after a reload, so a
  // running scan is never lost or paid for twice.
  useEffect(() => {
    if (phase === "progress" && !scan && !creatingScan.current) {
      // Reloaded before the scan was created: nothing to follow.
      setPhase("input");
      return;
    }
    if (phase !== "progress" || !scan || stalled || watchedScan.current === scan.scan_id) return;
    const scanId = scan.scan_id;
    watchedScan.current = scanId;
    poll(scanId).catch((error) => {
      watchedScan.current = null;
      setStalled(true);
      setNotice("Status checks are paused. Resume this scan rather than submitting the document again.");
      toast.error(errorMessage(error, "The scan could not be completed."));
    });
  }, [phase, scan, stalled, poll, setPhase, toast]);

  const runScan = async (input: string) => {
    const count = countWords(input);
    if (count < MIN_WORDS) return toast.error(`Provide at least ${MIN_WORDS} words.`);
    if (count > MAX_WORDS || input.length > MAX_CHARS) {
      return toast.error(`Keep the document under ${MAX_WORDS.toLocaleString()} words and ${MAX_CHARS.toLocaleString()} characters.`);
    }
    setScan(null);
    setPhase("progress");
    setFocused(null);
    setEdits({});
    setIgnored([]);
    let created: Scan;
    creatingScan.current = true;
    try {
      created = await postJson<Scan>("plagiarism-check", { text: input, title, options: settings });
    } catch (error) {
      setPhase("input");
      return toast.error(errorMessage(error, "The scan could not be started."));
    } finally {
      creatingScan.current = false;
    }
    setText(input);
    setScan(created);
  };

  const upload = async (file: File) => {
    setBusy("upload");
    try {
      assertUploadSize(file);
      const data = await postFile<{ text: string; title: string }>("plagiarism-check/extract", file);
      setText(data.text);
      setTitle(data.title || file.name);
      toast.success("Document text extracted.");
    } catch (error) {
      toast.error(errorMessage(error, "Could not read this file."));
    } finally {
      setBusy("");
    }
  };

  const downloadReport = async () => {
    if (!scan) return;
    setBusy("report");
    try {
      await downloadPost("plagiarism-check/report/pdf", { scan_id: scan.scan_id, text }, "similarity-report.pdf");
    } catch (error) {
      toast.error(errorMessage(error, "Could not build the report."));
    } finally {
      setBusy("");
    }
  };

  const reset = () => {
    pollRun.current += 1;
    if (scan) void remove(`plagiarism-check/${scan.scan_id}`).catch(() => undefined);
    setScan(null);
    setText("");
    setTitle("Pasted text");
    setPhase("input");
    setEdits({});
    setIgnored([]);
    setFocused(null);
    setStalled(false);
  };

  /** The document with every applied rewrite spliced in, for a recheck. */
  const rebuilt = () => {
    let output = text;
    [...(result?.matches ?? [])]
      .sort((a, b) => b.start - a.start)
      .forEach((match) => {
        if (edits[match.id] !== undefined) output = output.slice(0, match.start) + edits[match.id] + output.slice(match.end);
      });
    return output;
  };

  const renderDocument = () => {
    if (!result?.matches.length) return text;
    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    result.matches.forEach((match, index) => {
      if (match.start < cursor || match.start > text.length) return;
      nodes.push(<span key={`text-${index}`}>{text.slice(cursor, match.start)}</span>);
      const cleared = ignored.includes(match.id) || edits[match.id] !== undefined;
      nodes.push(
        <InlineSegment
          key={match.id}
          onSelect={() => {
            setFocused(match);
            setRewrite(edits[match.id] ?? match.text);
          }}
          className={`${cleared ? "bg-emerald-50 decoration-emerald-400" : TIER_STYLES[match.tier]} ${
            focused?.id === match.id ? "ring-2 ring-brand" : ""
          }`}
        >
          {edits[match.id] ?? text.slice(match.start, match.end)}
        </InlineSegment>,
      );
      cursor = match.end;
    });
    nodes.push(<span key="tail">{text.slice(cursor)}</span>);
    return nodes;
  };

  if (phase === "input") {
    return (
      <Card className="space-y-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Plagiarism Checker</h1>
          <p className="text-sm text-slate-500">Check a document against the open web and academic sources.</p>
        </div>
        <textarea
          className={`${textareaClass} min-h-[320px]`}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setTitle("Pasted text");
          }}
          placeholder="Paste the document to check…"
        />
        <div className="rounded-lg border border-slate-200 px-3 py-1">
          {SETTINGS.map((item) => (
            <Toggle
              key={item.key}
              checked={settings[item.key]}
              onChange={(checked) => setSettings((current) => ({ ...current, [item.key]: checked }))}
              label={item.label}
              description={item.description}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void runScan(text)} disabled={!!busy || words < MIN_WORDS || words > MAX_WORDS || text.length > MAX_CHARS}>
            Check for plagiarism
          </Button>
          <FileButton accept={DOCUMENT_ACCEPT} disabled={!!busy} onFile={(file) => void upload(file)}>
            {busy === "upload" && <Spinner />} Upload document
          </FileButton>
          <span className={`ml-auto text-xs ${words > MAX_WORDS || text.length > MAX_CHARS ? "text-red-600" : "text-slate-500"}`}>
            {words.toLocaleString()} / {MAX_WORDS.toLocaleString()} words · {title}
          </span>
        </div>
      </Card>
    );
  }

  if (phase === "progress" || !result) {
    return (
      <Card className="mx-auto max-w-xl space-y-4 py-8 text-center" >
        <div className="text-sm font-medium text-slate-500">Scanning “{title}”</div>
        <div className="text-3xl font-bold text-slate-900">{Math.max(3, scan?.progress ?? 0)}%</div>
        <div className="mx-auto h-2 w-full max-w-sm rounded-full bg-slate-100">
          <div className="h-2 rounded-full bg-brand transition-all" style={{ width: `${Math.max(4, scan?.progress ?? 0)}%` }} />
        </div>
        <p className="text-sm text-slate-500">{notice}</p>
        {stalled && scan && (
          <div className="flex justify-center gap-2">
            <Button onClick={() => setStalled(false)}>Resume this scan</Button>
            <Button variant="secondary" onClick={reset}>
              Start over
            </Button>
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-3">
        {scan?.revision && (
          <div className="rounded-lg bg-brand-soft p-3 text-sm text-brand-dark">
            This document overlaps {scan.revision.similarity_percent}% with an earlier scan, “{scan.revision.title}”.
          </div>
        )}
        {dirty && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-soft p-3 text-sm text-brand-dark">
            You rewrote passages. Recheck to update the score.
            <Button onClick={() => void runScan(rebuilt())}>Recheck now</Button>
          </div>
        )}
        <div className="flex gap-1.5">
          {[false, true].map((value) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setFlaggedOnly(value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                flaggedOnly === value ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-600"
              }`}
            >
              {value ? `Flagged only (${activeMatches.length})` : "All text"}
            </button>
          ))}
        </div>
        {flaggedOnly ? (
          <Card className="space-y-2">
            <div className="flex justify-end">
              <Button
                variant="secondary"
                disabled={!activeMatches.length}
                onClick={() =>
                  void navigator.clipboard
                    .writeText(activeMatches.map((match) => edits[match.id] ?? match.text).join("\n\n"))
                    .then(() => toast.success("Flagged passages copied."))
                }
              >
                Copy all
              </Button>
            </div>
            {activeMatches.length ? (
              activeMatches.map((match) => (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => {
                    setFocused(match);
                    setRewrite(edits[match.id] ?? match.text);
                  }}
                  className="block w-full rounded-lg border border-slate-200 p-3 text-left text-sm hover:bg-slate-50"
                >
                  {edits[match.id] ?? match.text}
                  <span className="mt-1 block text-xs text-slate-500">
                    {match.percent_similar}% match · {match.tier_label}
                  </span>
                </button>
              ))
            ) : (
              <p className="text-sm text-slate-400">No flagged passages.</p>
            )}
          </Card>
        ) : (
          <Card>
            <div className="max-h-[600px] overflow-y-auto whitespace-pre-wrap font-serif text-[15px] leading-8">{renderDocument()}</div>
          </Card>
        )}
      </div>

      <aside className="space-y-3">
        {focused ? (
          <Card className="space-y-3">
            <button type="button" className="text-xs font-medium text-brand" onClick={() => setFocused(null)}>
              ← Back to overview
            </button>
            <div className="rounded-lg bg-slate-50 p-3 text-sm">{focused.text}</div>
            <div className="text-xs text-slate-500">
              {focused.percent_similar}% match · {focused.tier_label}
            </div>
            {focused.source?.url && (
              <a className="block break-all text-xs text-brand underline" href={focused.source.url} target="_blank" rel="noopener noreferrer">
                {focused.source.url}
              </a>
            )}
            <textarea className={textareaClass} rows={4} value={rewrite} onChange={(event) => setRewrite(event.target.value)} />
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={!rewrite.trim()}
                onClick={() => {
                  setEdits((current) => ({ ...current, [focused.id]: rewrite.trim() }));
                  setFocused(null);
                }}
              >
                Apply rewrite
              </Button>
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => {
                  setIgnored((current) => [...current, focused.id]);
                  setFocused(null);
                }}
              >
                Exclude match
              </Button>
            </div>
          </Card>
        ) : (
          <>
            <Card className="space-y-3">
              <div>
                <div className="text-3xl font-bold text-slate-900">{score}%</div>
                <div className="text-sm text-slate-600">
                  Overall similarity · {score < 15 ? "Low" : score < 35 ? "Review recommended" : "Needs attention"}
                </div>
              </div>
              <ScoreBar percent={score} />
              <div className="divide-y divide-slate-100 text-sm">
                {[
                  ["Likely copied", result.breakdown.copied, "bg-red-500"],
                  ["Likely paraphrased", result.breakdown.paraphrased, "bg-amber-500"],
                  ["Common phrasing", result.breakdown.common, "bg-slate-400"],
                ].map(([label, value, dot]) => (
                  <div key={String(label)} className="flex items-center justify-between py-1.5">
                    <span className="flex items-center gap-2 text-slate-700">
                      <span className={`h-2 w-2 rounded-full ${dot}`} />
                      {label}
                    </span>
                    <span className="font-medium">{value}%</span>
                  </div>
                ))}
              </div>
              <Button className="w-full" variant="secondary" disabled={!!busy || dirty} onClick={() => void downloadReport()}>
                {busy === "report" && <Spinner />} Download PDF report
              </Button>
              <Button className="w-full" variant="ghost" onClick={reset}>
                New scan
              </Button>
            </Card>
            <Card className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Sources</h3>
              {result.sources.length ? (
                result.sources.map((source, index) => (
                  <div key={source.id || source.url} className="flex items-start justify-between gap-2 text-sm">
                    <a className="min-w-0 break-all text-brand underline" href={source.url} target="_blank" rel="noopener noreferrer">
                      {index + 1}. {source.domain}
                    </a>
                    <span className="shrink-0 text-slate-600">{Math.round(source.percent)}%</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">No matching sources found.</p>
              )}
            </Card>
          </>
        )}
      </aside>
    </div>
  );
}
