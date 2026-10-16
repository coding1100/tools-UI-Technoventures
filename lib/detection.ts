import { getJson } from "@/lib/api";

/** Response contract of POST /tools/ai-detect. The backend does all scoring. */

export type SegmentLabel = "human" | "mixed" | "ai" | "neutral";

export interface DetectSegment {
  text: string;
  start: number;
  end: number;
  label: SegmentLabel;
  prob_ai: number;
  reasons: string[];
}

export interface DetectionResponse {
  verdict: {
    ai_percent: number;
    human_percent: number;
    ai_content_share_percent?: number;
    human_content_share_percent?: number;
    confidence: number;
    label: SegmentLabel;
  };
  breakdown: { ai: number; mixed: number; human: number };
  segments?: DetectSegment[];
  trust: { trustworthy: boolean; reason: string };
  meta: {
    engine_version: string;
    model_version: string;
    words: number;
    truncated: boolean;
    low_confidence?: boolean;
    warning?: string;
    latency_ms: number;
  };
}

export interface DetectorConfig {
  minimum_words: number;
  low_confidence_words: number;
  maximum_words: number;
}

export const FALLBACK_DETECTOR_CONFIG: DetectorConfig = {
  minimum_words: 100,
  low_confidence_words: 180,
  maximum_words: 1500,
};

/** Share of AI-like content, the headline number (same as the backend report). */
export function aiShare(result: DetectionResponse): number {
  return result.verdict.ai_content_share_percent ?? Math.round(result.breakdown.ai + result.breakdown.mixed * 0.5);
}

export function humanShare(result: DetectionResponse): number {
  return result.verdict.human_content_share_percent ?? 100 - aiShare(result);
}

export function detectionSummary(percent: number): string {
  return percent < 35
    ? "Reads as human-written"
    : percent < 65
      ? "Mixed writing patterns"
      : "Predominantly AI-like writing patterns";
}

export const SEGMENT_STYLES: Record<SegmentLabel, string> = {
  human: "bg-emerald-100 decoration-emerald-500",
  mixed: "bg-amber-100 decoration-amber-500",
  ai: "bg-red-100 decoration-red-500",
  neutral: "bg-slate-100 decoration-slate-400",
};

let detectorConfig: Promise<DetectorConfig> | null = null;

/** Detector word limits from the backend, falling back to the known defaults. */
export function loadDetectorConfig(): Promise<DetectorConfig> {
  detectorConfig ??= getJson<DetectorConfig>("ai-detect/config")
    .then((config) => (Number.isFinite(config?.maximum_words) ? config : FALLBACK_DETECTOR_CONFIG))
    .catch(() => {
      detectorConfig = null;
      return FALLBACK_DETECTOR_CONFIG;
    });
  return detectorConfig;
}
