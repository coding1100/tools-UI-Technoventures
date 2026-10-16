import type { Metadata } from "next";
import Humanizer from "@/components/Humanizer";

export const metadata: Metadata = { title: "Humanizer" };

export default function HumanizerPage() {
  return <Humanizer />;
}
