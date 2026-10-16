import { ScoreBar } from "@/components/ui/primitives";
import { aiShare, DetectionResponse, detectionSummary, humanShare } from "@/lib/detection";

const BREAKDOWN_ROWS = [
  { key: "ai" as const, label: "AI-like words", dot: "bg-red-500" },
  { key: "mixed" as const, label: "Mixed or uncertain words", dot: "bg-amber-500" },
  { key: "human" as const, label: "Human-like words", dot: "bg-emerald-500" },
];

/** Headline score, composition breakdown and any caveat the backend attached. */
export default function DetectionScore({ result }: { result: DetectionResponse }) {
  const ai = aiShare(result);
  return (
    <div className="space-y-3">
      <div>
        <div className="text-3xl font-bold text-slate-900">{ai}%</div>
        <div className="text-sm text-slate-600">AI-like content · {detectionSummary(ai)}</div>
      </div>
      <ScoreBar percent={ai} />
      <div className="text-xs text-slate-500">{humanShare(result)}% human-like content across {result.meta.words} words</div>
      <div className="divide-y divide-slate-100">
        {BREAKDOWN_ROWS.map((row) => (
          <div key={row.key} className="flex items-center justify-between py-1.5 text-sm">
            <span className="flex items-center gap-2 text-slate-700">
              <span className={`h-2 w-2 rounded-full ${row.dot}`} />
              {row.label}
            </span>
            <span className="font-medium text-slate-700">{result.breakdown[row.key]}%</span>
          </div>
        ))}
      </div>
      {(result.meta.warning || result.meta.truncated || !result.trust.trustworthy) && (
        <div className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
          {[result.meta.warning, result.meta.truncated && "Input was truncated.", !result.trust.trustworthy && result.trust.reason]
            .filter(Boolean)
            .join(" ")}
        </div>
      )}
    </div>
  );
}
