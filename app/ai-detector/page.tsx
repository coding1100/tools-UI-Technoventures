import type { Metadata } from "next";
import AiDetector from "@/components/AiDetector";

export const metadata: Metadata = { title: "AI Detector" };

export default function AiDetectorPage() {
  return <AiDetector />;
}
