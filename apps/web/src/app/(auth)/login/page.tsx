"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/auth";
import { ApiError } from "@/lib/api-client";
import { useDictionary } from "@/lib/i18n";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useDictionary();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push(searchParams.get("next") ?? "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.auth.login.genericError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div>
        <h1 className="text-md font-medium text-foreground">{t.auth.login.heading}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.auth.login.subheading}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">{t.auth.login.emailLabel}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t.auth.login.passwordLabel}</Label>
          <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
            {t.auth.login.forgotPasswordLink}
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t.auth.login.submitting : t.auth.login.submit}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t.auth.login.noAccount}{" "}
        <Link href="/register" className="text-primary hover:underline">
          {t.auth.login.createAccount}
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
