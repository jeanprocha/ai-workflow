"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useDictionary } from "@/lib/i18n";

function InvalidTokenCard() {
  const t = useDictionary();
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-6 text-center">
      <div className="space-y-1">
        <h1 className="text-md font-medium text-foreground">
          {t.auth.resetPassword.invalidTokenTitle}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.auth.resetPassword.invalidTokenDescription}
        </p>
      </div>
      <Link href="/forgot-password" className="text-sm text-primary hover:underline">
        {t.auth.resetPassword.requestNewLink}
      </Link>
    </div>
  );
}

function ResetPasswordForm({ token }: { token: string }) {
  const t = useDictionary();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        body: { token, password },
        withWorkspace: false,
        handleAuthErrors: false,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.auth.resetPassword.genericError);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-6 text-center">
        <div className="space-y-1">
          <h1 className="text-md font-medium text-foreground">
            {t.auth.resetPassword.successTitle}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.auth.resetPassword.successDescription}
          </p>
        </div>
        <Link href="/login" className="text-sm text-primary hover:underline">
          {t.auth.resetPassword.goToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div>
        <h1 className="text-md font-medium text-foreground">{t.auth.resetPassword.heading}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.auth.resetPassword.subheading}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">{t.auth.resetPassword.passwordLabel}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t.auth.resetPassword.passwordHint}</p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t.auth.resetPassword.submitting : t.auth.resetPassword.submit}
      </Button>
    </form>
  );
}

function ResetPasswordGate() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  if (!token) return <InvalidTokenCard />;
  return <ResetPasswordForm token={token} />;
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordGate />
    </Suspense>
  );
}
