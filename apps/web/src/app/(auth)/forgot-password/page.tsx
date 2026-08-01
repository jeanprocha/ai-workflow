"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useDictionary } from "@/lib/i18n";

export default function ForgotPasswordPage() {
  const t = useDictionary();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: { email },
        withWorkspace: false,
        handleAuthErrors: false,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.auth.forgotPassword.genericError);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-6 text-center">
        <div className="space-y-1">
          <h1 className="text-md font-medium text-foreground">
            {t.auth.forgotPassword.successTitle}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.auth.forgotPassword.successDescription}
          </p>
        </div>
        <Link href="/login" className="text-sm text-primary hover:underline">
          {t.auth.forgotPassword.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div>
        <h1 className="text-md font-medium text-foreground">{t.auth.forgotPassword.heading}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.auth.forgotPassword.subheading}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">{t.auth.forgotPassword.emailLabel}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t.auth.forgotPassword.submitting : t.auth.forgotPassword.submit}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary hover:underline">
          {t.auth.forgotPassword.backToLogin}
        </Link>
      </p>
    </form>
  );
}
