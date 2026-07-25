"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { register } from "@/lib/auth";
import { ApiError } from "@/lib/api-client";
import { useDictionary } from "@/lib/i18n";

export default function RegisterPage() {
  const router = useRouter();
  const t = useDictionary();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(name, email, password);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.auth.register.genericError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-border bg-card p-6"
    >
      <div>
        <h1 className="text-md font-medium text-foreground">{t.auth.register.heading}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.auth.register.subheading}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">{t.auth.register.nameLabel}</Label>
        <Input
          id="name"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">{t.auth.register.emailLabel}</Label>
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
        <Label htmlFor="password">{t.auth.register.passwordLabel}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t.auth.register.passwordHint}</p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t.auth.register.submitting : t.auth.register.submit}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t.auth.register.hasAccount}{" "}
        <Link href="/login" className="text-primary hover:underline">
          {t.auth.register.signIn}
        </Link>
      </p>
    </form>
  );
}
