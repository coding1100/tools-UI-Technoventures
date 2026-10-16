"use client";

import { useEffect, useMemo, useState } from "react";
import DetectionScore from "@/components/DetectionScore";
import { useToast } from "@/components/ui/Toast";
import { Button, Card, FileButton, InlineSegment, Spinner, textareaClass } from "@/components/ui/primitives";
import { downloadPost, errorMessage, postJson } from "@/lib/api";
import {
  DetectionResponse,
  DetectorConfig,
  DetectSegment,
  FALLBACK_DETECTOR_CONFIG,
  loadDetectorConfig,
  SEGMENT_STYLES,
  SegmentLabel,
} from "@/lib/detection";
import { usePersistentState } from "@/lib/persistentState";
import { countWords } from "@/lib/text";
import { DOCUMENT_ACCEPT, extractText, IMAGE_ACCEPT } from "@/lib/uploads";

type Filter = "all" | Exclude<SegmentLabel, "neutral">;
type Segment = DetectSegment & { edited: boolean; ignored: boolean };

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "human", label: "Human" },
  { key: "mixed", label: "Mixed" },
  { key: "ai", label: "AI" },
];

export default function AiDetector() {
  const toast = useToast();
  const [config, setConfig] = useState<DetectorConfig>(FALLBACK_DETECTOR_CONFIG);
  const [text, setText] = usePersistentState("detector.text", "");
  const [busy, setBusy] = useState<"" | "scan" | "upload" | "report">("");
  const [result, setResult] = usePersistentState<DetectionResponse | null>("detector.result", null);
  const [segments, setSegments] = usePersistentState<Segment[]>("detector.segments", []);
  const [filter, setFilter] = useState<Filter>("all");
  const [focused, setFocused] = useState<number | null>(null);
  const [rewrite, setRewrite] = useState("");

  useEffect(() => {
    void loadDetectorConfig().then(setConfig);
  }, []);

  const words = useMemo(() => countWords(text), [text]);
  const dirty = segments.some((segment) => segment.edited || segment.ignored);
  const documentText = () => segments.map((segment) => segment.text).join(" ");

  const validate = (input: string) => {
    const count = countWords(input);
    if (count < config.minimum_words) return `Add at least ${config.minimum_words} words for a reliable score.`;
    if (count > config.maximum_words) return `Keep the text at or under ${config.maximum_words} words.`;
    return null;
  };

  const scan = async (input: string) => {
    const problem = validate(input);
    if (problem) return toast.error(problem);
    setBusy("scan");
    try {
      const data = await postJson<DetectionResponse>("ai-detect", {
        text: input,
        options: { include_segments: true, include_signals: true },
      });
      setText(input);
      setResult(data);
      setSegments((data.segments ?? []).map((segment) => ({ ...segment, edited: false, ignored: false })));
      setFilter("all");
      setFocused(null);
    } catch (error) {
      toast.error(errorMessage(error, "The scan failed."));
    } finally {
      setBusy("");
    }
  };

  const upload = async (file: File) => {
    setBusy("upload");
    try {
      const extracted = await extractText(file);
      if (!extracted) return toast.error("No readable text found in this file.");
      setText(extracted);
      setResult(null);
      toast.success("Text extracted.");
    } catch (error) {
      toast.error(errorMessage(error, "Could not read this file."));
    } finally {
      setBusy("");
    }
  };

  const downloadReport = async () => {
    setBusy("report");
    try {
      await downloadPost("ai-detect/report", { text: documentText() }, "ai-detection-report.pdf");
    } catch (error) {
      toast.error(errorMessage(error, "Could not build the report."));
    } finally {
      setBusy("");
    }
  };

  const updateFocused = (patch: Partial<Segment>) => {
    if (focused === null) return;
    setSegments((current) => current.map((segment, index) => (index === focused ? { ...segment, ...patch } : segment)));
    setFocused(null);
  };

  const reset = () => {
    setText("");
    setResult(null);
    setSegments([]);
    setFocused(null);
  };

  const focusedSegment = focused === null ? null : segments[focused];
  const counts = segments.reduce<Record<string, number>>((acc, segment) => {
    acc[segment.label] = (acc[segment.label] ?? 0) + 1;
    return acc;
  }, {});

  if (!result) {
    return (
      <Card className="space-y-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">AI Detector</h1>
          <p className="text-sm text-slate-500">Paste text, or upload a document or a screenshot of a page.</p>
        </div>
        <textarea
          className={`${textareaClass} min-h-[320px]`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste the text to check…"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void scan(text)} disabled={!!busy || !text.trim()}>
            {busy === "scan" && <Spinner />} Check for AI
          </Button>
          <FileButton accept={`${DOCUMENT_ACCEPT},${IMAGE_ACCEPT}`} disabled={!!busy} onFile={(file) => void upload(file)}>
            {busy === "upload" && <Spinner />} Upload file or image
          </FileButton>
          <span className={`ml-auto text-xs ${words > config.maximum_words ? "text-red-600" : "text-slate-500"}`}>
            {words} / {config.maximum_words} words (minimum {config.minimum_words})
          </span>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-3">
        {dirty && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-soft p-3 text-sm text-brand-dark">
            You changed the document. Rescan to update the score.
            <Button onClick={() => void scan(documentText())} disabled={!!busy}>
              {busy === "scan" && <Spinner />} Rescan
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                filter === item.key ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-600"
              }`}
            >
              {item.label} {item.key === "all" ? segments.length : counts[item.key] ?? 0}
            </button>
          ))}
        </div>
        <Card>
          <div className="max-h-[560px] overflow-y-auto font-serif text-[15px] leading-8">
            {segments.map((segment, index) => {
              const settled = segment.edited || segment.ignored;
              const dimmed = (filter !== "all" && !settled && segment.label !== filter) || (focused !== null && focused !== index);
              return (
                <span key={index}>
                  <InlineSegment
                    onSelect={() => {
                      setFocused(index);
                      setRewrite("");
                    }}
                    title={settled ? "Changed: rescan to rescore" : `${Math.round(segment.prob_ai * 100)}% AI likelihood`}
                    className={`${SEGMENT_STYLES[settled ? "neutral" : segment.label]} ${dimmed ? "opacity-40" : ""} ${
                      focused === index ? "ring-2 ring-brand" : ""
                    }`}
                  >
                    {segment.text}
                  </InlineSegment>{" "}
                </span>
              );
            })}
          </div>
        </Card>
      </div>

      <aside className="space-y-3">
        {focusedSegment ? (
          <Card className="space-y-3">
            <button type="button" className="text-xs font-medium text-brand" onClick={() => setFocused(null)}>
              ← Back to score
            </button>
            <div className="rounded-lg bg-slate-50 p-3 text-sm">{focusedSegment.text}</div>
            <div className="text-xs text-slate-500">
              {focusedSegment.label} · {Math.round(focusedSegment.prob_ai * 100)}% AI likelihood
            </div>
            {focusedSegment.reasons.length > 0 && <p className="text-sm text-slate-600">{focusedSegment.reasons.join(" ")}</p>}
            <Button
              variant="secondary"
              onClick={() => void navigator.clipboard.writeText(focusedSegment.text).then(() => toast.success("Copied."))}
            >
              Copy sentence
            </Button>
            <textarea
              className={textareaClass}
              rows={3}
              value={rewrite}
              onChange={(event) => setRewrite(event.target.value)}
              placeholder="Write your own version…"
            />
            <div className="flex gap-2">
              <Button className="flex-1" disabled={!rewrite.trim()} onClick={() => updateFocused({ text: rewrite.trim(), edited: true })}>
                Replace
              </Button>
              <Button className="flex-1" variant="secondary" onClick={() => updateFocused({ ignored: true })}>
                Ignore
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="space-y-3">
            <DetectionScore result={result} />
            <Button className="w-full" variant="secondary" onClick={() => void downloadReport()} disabled={!!busy}>
              {busy === "report" && <Spinner />} Download PDF report
            </Button>
            <Button className="w-full" variant="ghost" onClick={reset}>
              New check
            </Button>
            <p className="text-[11px] text-slate-400">
              Model {result.meta.model_version} · Engine {result.meta.engine_version} · {result.meta.latency_ms} ms
            </p>
          </Card>
        )}
      </aside>
    </div>
  );
}
