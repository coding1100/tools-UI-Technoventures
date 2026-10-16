import type { Metadata } from "next";
import PlagiarismChecker from "@/components/PlagiarismChecker";

export const metadata: Metadata = { title: "Plagiarism Checker" };

export default function PlagiarismCheckerPage() {
  return <PlagiarismChecker />;
}
