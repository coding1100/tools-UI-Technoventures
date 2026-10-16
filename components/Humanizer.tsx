"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DetectionScore from "@/components/DetectionScore";
import { useToast } from "@/components/ui/Toast";
import { Button, Card, FileButton, selectClass, Spinner, textareaClass, Toggle } from "@/components/ui/primitives";
import { errorMessage, pollJson, postJson, remove, saveBlob, sleep } from "@/lib/api";
import { aiShare, DetectionResponse, FALLBACK_DETECTOR_CONFIG, loadDetectorConfig } from "@/lib/detection";
import { countWords } from "@/lib/text";
import { DOCUMENT_ACCEPT, extractText, IMAGE_ACCEPT } from "@/lib/uploads";

/** The backend's top word tier, which the team account always gets. */
const MAX_WORDS = 1500;
const POLL_MS = 2000;

const TONES = [
  { value: "natural", label: "Natural" },
  { value: "simple", label: "Simple" },
  { value: "polished", label: "Polished" },
  { value: "academic", label: "Academic" },
  { value: "custom", label: "Custom" },
] as const;
const INTENSITIES = [
  { value: "normal", label: "Normal", hint: "Light touch, closest to the original" },
  { value: "moderate", label: "Moderate", hint: "Balanced rewrite (recommended)" },
  { value: "full", label: "Full", hint: "Substantial restructuring, same meaning" },
] as const;
const REGISTERS = ["auto", "academic", "professional", "natural", "personal", "marketing"] as const;

type Tone = (typeof TONES)[number]["value"];
type Intensity = (typeof INTENSITIES)[number]["value"];
type Register = (typeof REGISTERS)[number];

type HumanizerResult = {
  rewritten_text: string;
  diff: { type: "equal" | "insert" | "delete"; value: string }[] | null;
  register_mode: string;
  rewrite_intensity: Intensity;
  citations_preserved: boolean;
  citation_count: number;
  voice_profile_used: boolean;
  quality_issues: string[];
};
type HumanizerJob = {
  job_id: string;
  status: "queued" | "processing" | "finalizing" | "completed" | "failed" | "cancelled";
  progress: number;
  result: HumanizerResult | null;
  error: string | null;
};
type Side = "original" | "rewritten";

export default function Humanizer() {
  const toast = useToast();
  const [text, setText] = useState("");
  const [tone, setTone] = useState<Tone>("natural");
  const [customTone, setCustomTone] = useState("");
  const [intensity, setIntensity] = useState<Intensity>("moderate");
  const [register, setRegister] = useState<Register>("auto");
  const [voiceSample, setVoiceSample] = useState("");
  const [preserveCitations, setPreserveCitations] = useState(true);
  const [showOptions, setShowOptions] = useState(false);

  const [job, setJob] = useState<HumanizerJob | null>(null);
  const [result, setResult] = useState<HumanizerResult | null>(null);
  const [submittedText, setSubmittedText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [scores, setScores] = useState<Partial<Record<Side, DetectionResponse>>>({});
  const [scoring, setScoring] = useState(false);
  const [minDetectWords, setMinDetectWords] = useState(FALLBACK_DETECTOR_CONFIG.minimum_words);
  const activeJob = useRef<string | null>(null);

  useEffect(() => {
    void loadDetectorConfig().then((config) => setMinDetectWords(config.minimum_words));
    // Stop polling if the page is left mid-run.
    return () => {
      activeJob.current = null;
    };
  }, []);

  const words = useMemo(() => countWords(text), [text]);
  const running = !!job && !["completed", "failed", "cancelled"].includes(job.status);

  const humanize = async () => {
    if (!text.trim()) return toast.error("Enter some text first.");
    if (words > MAX_WORDS) return toast.error(`Keep the text at or under ${MAX_WORDS} words.`);
    if (tone === "custom" && !customTone.trim()) return toast.error("Describe the custom tone.");

    setResult(null);
    setScores({});
    setShowChanges(false);
    setSubmittedText(text);
    let jobId: string | null = null;
    try {
      const created = await postJson<HumanizerJob>("humanizer/jobs", {
        text,
        tone_mode: tone,
        ...(tone === "custom" ? { custom_tone_instruction: customTone.trim() } : {}),
        rewrite_intensity: intensity,
        ...(register !== "auto" ? { register_mode: register } : {}),
        ...(voiceSample.trim() ? { voice_sample: voiceSample.trim() } : {}),
        preserve_citations: preserveCitations,
        return_diff: true,
      });
      jobId = created.job_id;
      activeJob.current = jobId;
      setJob(created);

      // A full run takes 30 to 70 seconds, so the job is polled rather than awaited.
      let current = created;
      while (!["completed", "failed", "cancelled"].includes(current.status)) {
        await sleep(POLL_MS);
        if (activeJob.current !== jobId) return; // Cancelled, or the page was left.
        current = await pollJson<HumanizerJob>(`humanizer/jobs/${jobId}`);
        setJob(current);
      }
      if (current.status === "completed" && current.result) {
        setResult(current.result);
        toast.success("Rewrite ready.");
      } else if (current.status === "failed") {
        toast.error(current.error || "The rewrite failed.");
      }
    } catch (error) {
      setJob(null);
      toast.error(errorMessage(error, "The rewrite failed."));
    } finally {
      if (activeJob.current === jobId) activeJob.current = null;
    }
  };

  const cancel = async () => {
    const id = activeJob.current;
    activeJob.current = null;
    setJob(null);
    if (id) await remove(`humanizer/jobs/${id}`).catch(() => undefined);
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const extracted = await extractText(file);
      if (!extracted) return toast.error("No readable text found in this file.");
      setText(extracted);
      toast.success("Text extracted.");
    } catch (error) {
      toast.error(errorMessage(error, "Could not read this file."));
    } finally {
      setUploading(false);
    }
  };

  const scoreBoth = async () => {
    if (!result) return;
    const inputs: Record<Side, string> = { original: submittedText, rewritten: result.rewritten_text };
    const eligible = (Object.keys(inputs) as Side[]).filter((side) => countWords(inputs[side]) >= minDetectWords);
    if (!eligible.length) return toast.error(`AI scoring needs at least ${minDetectWords} words.`);
    setScoring(true);
    try {
      const settled = await Promise.all(
        eligible.map(async (side) => [side, await postJson<DetectionResponse>("ai-detect", { text: inputs[side] })] as const),
      );
      setScores(Object.fromEntries(settled));
    } catch (error) {
      toast.error(errorMessage(error, "AI scoring failed."));
    } finally {
      setScoring(false);
    }
  };

  const copy = () => result && void navigator.clipboard.writeText(result.rewritten_text).then(() => toast.success("Copied."));
  const download = () => result && saveBlob(new Blob([result.rewritten_text], { type: "text/plain" }), "rewritten.txt");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Humanizer</h1>
          <p className="text-sm text-slate-500">Rewrite text so it reads naturally, keeping the meaning and citations.</p>
        </div>
        <textarea
          className={`${textareaClass} min-h-[300px]`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste the text to rewrite…"
          disabled={running}
        />
        <div className="flex items-center justify-between text-xs">
          <FileButton accept={`${DOCUMENT_ACCEPT},${IMAGE_ACCEPT}`} disabled={uploading || running} onFile={(file) => void upload(file)}>
            {uploading && <Spinner />} Upload file or image
          </FileButton>
          <span className={words > MAX_WORDS ? "text-red-600" : "text-slate-500"}>
            {words} / {MAX_WORDS} words
          </span>
        </div>

        <div>
          <div className="mb-1.5 text-sm font-medium text-slate-700">Rewrite intensity</div>
          <div className="grid grid-cols-3 gap-1.5">
            {INTENSITIES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setIntensity(item.value)}
                className={`rounded-lg border px-2 py-1.5 text-sm font-medium ${
                  intensity === item.value ? "border-brand bg-brand-soft text-brand-dark" : "border-slate-300 text-slate-600"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">{INTENSITIES.find((item) => item.value === intensity)?.hint}</p>
        </div>

        <button type="button" className="text-sm font-medium text-brand" onClick={() => setShowOptions(!showOptions)}>
          {showOptions ? "Hide options" : "More options"}
        </button>
        {showOptions && (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Tone
                <select className={`${selectClass} mt-1 w-full`} value={tone} onChange={(event) => setTone(event.target.value as Tone)}>
                  {TONES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Writing register
                <select
                  className={`${selectClass} mt-1 w-full capitalize`}
                  value={register}
                  onChange={(event) => setRegister(event.target.value as Register)}
                >
                  {REGISTERS.map((item) => (
                    <option key={item} value={item}>
                      {item === "auto" ? "Auto-detect" : item}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {tone === "custom" && (
              <textarea
                className={textareaClass}
                rows={2}
                maxLength={400}
                value={customTone}
                onChange={(event) => setCustomTone(event.target.value)}
                placeholder="Describe the tone, e.g. confident but friendly, short sentences"
              />
            )}
            <label className="block text-sm font-medium text-slate-700">
              Voice sample <span className="font-normal text-slate-500">(optional: your own writing, used for style only)</span>
              <textarea
                className={`${textareaClass} mt-1`}
                rows={3}
                maxLength={12000}
                value={voiceSample}
                onChange={(event) => setVoiceSample(event.target.value)}
                placeholder="Paste a paragraph you wrote…"
              />
            </label>
            <Toggle checked={preserveCitations} onChange={setPreserveCitations} label="Preserve citations" />
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={() => void humanize()} disabled={running || uploading || !text.trim() || words > MAX_WORDS}>
            {running && <Spinner />} {running ? "Rewriting…" : "Humanize"}
          </Button>
          {running && (
            <Button variant="secondary" onClick={() => void cancel()}>
              Cancel
            </Button>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Result</h2>
          {result && (
            <div className="flex flex-wrap gap-1.5">
              <Button variant="secondary" onClick={() => setShowChanges(!showChanges)} disabled={!result.diff}>
                {showChanges ? "Hide changes" : "Show changes"}
              </Button>
              <Button variant="secondary" onClick={copy}>
                Copy
              </Button>
              <Button variant="secondary" onClick={download}>
                Download .txt
              </Button>
            </div>
          )}
        </div>

        {running && job && (
          <div className="space-y-2 py-10 text-center text-sm text-slate-500">
            <div className="mx-auto h-2 w-full max-w-xs rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-brand transition-all" style={{ width: `${Math.max(5, job.progress)}%` }} />
            </div>
            Rewriting, this usually takes under a minute ({job.progress}%)
          </div>
        )}
        {!running && !result && <p className="py-10 text-center text-sm text-slate-400">The rewritten text will appear here.</p>}

        {result && (
          <>
            <div className="max-h-[460px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6">
              {showChanges && result.diff
                ? result.diff.map((part, index) =>
                    part.type === "insert" ? (
                      <ins key={index} className="bg-emerald-100 no-underline">{part.value}</ins>
                    ) : part.type === "delete" ? (
                      <del key={index} className="bg-red-100 text-red-700">{part.value}</del>
                    ) : (
                      <span key={index}>{part.value}</span>
                    ),
                  )
                : result.rewritten_text}
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 capitalize">Register: {result.register_mode}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 capitalize">Intensity: {result.rewrite_intensity}</span>
              {result.citations_preserved && result.citation_count > 0 && (
                <span className="rounded-full bg-slate-100 px-2.5 py-1">Citations preserved: {result.citation_count}</span>
              )}
              {result.voice_profile_used && <span className="rounded-full bg-slate-100 px-2.5 py-1">Voice sample applied</span>}
            </div>
            {result.quality_issues.length > 0 && (
              <p className="text-xs text-amber-700">Notes: {result.quality_issues.join("; ")}</p>
            )}

            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">AI score</h3>
                <Button variant="secondary" onClick={() => void scoreBoth()} disabled={scoring}>
                  {scoring && <Spinner />} {Object.keys(scores).length ? "Rescore" : "Check AI score"}
                </Button>
              </div>
              {Object.keys(scores).length > 0 && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {(["original", "rewritten"] as Side[]).map((side) => {
                    const score = scores[side];
                    return (
                      <div key={side}>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {side === "original" ? "Before" : "After"}
                        </div>
                        {score ? (
                          <DetectionScore result={score} />
                        ) : (
                          <p className="text-xs text-slate-400">Too short to score.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {scores.original && scores.rewritten && (
                <p className="mt-2 text-xs text-slate-500">
                  {aiShare(scores.original)}% to {aiShare(scores.rewritten)}% AI-like content
                </p>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
