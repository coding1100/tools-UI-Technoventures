"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, Spinner } from "@/components/ui/primitives";
import { APP_NAME } from "@/lib/appName";

const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

/** Only same-site paths, so the login page cannot be used to redirect elsewhere. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/humanizer";
}

export default function LoginForm() {
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (response.ok) {
        window.location.assign(next);
        return;
      }
      const payload = await response.json().catch(() => null);
      setError(payload?.message || "Sign-in failed.");
    } catch {
      setError("Network error. Try again.");
    }
    setSubmitting(false);
  };

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <h1 className="text-lg font-semibold text-slate-900">Sign in to {APP_NAME}</h1>
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              className={inputClass}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Spinner />} Sign in
          </Button>
        </form>
      </Card>
    </div>
  );
}
