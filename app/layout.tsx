import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import { APP_NAME } from "@/lib/appName";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
