"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDictionary } from "@/lib/i18n";
import { ApiError } from "@/lib/errors";
import { reportClientError } from "@/lib/telemetry";

export default function AppError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  const t = useDictionary();

  useEffect(() => {
    reportClientError({
      kind: "error",
      message: error.message,
      stack: error.stack,
      requestId: error instanceof ApiError ? error.requestId : undefined,
    });
  }, [error]);

  const retry = unstable_retry ?? reset;

  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-4 px-4 text-center">
      <TriangleAlertIcon className="size-8 text-destructive" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{t.errors.boundary.title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{t.errors.boundary.description}</p>
      </div>
      <div className="flex gap-2">
        {retry && (
          <Button variant="outline" onClick={() => retry()}>
            {t.errors.boundary.retry}
          </Button>
        )}
        <Button render={<Link href="/dashboard" />}>{t.errors.boundary.backHome}</Button>
      </div>
    </div>
  );
}
