"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Logo } from "@/components/site/logo";
import { Button, buttonClass } from "@/components/ui/button";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";

  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
          <Logo />
        </div>
      </header>
      <main className="flex flex-1 items-center">
        <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
          <p className="text-[13px] text-err">500 · something broke</p>
          <h1 className="mt-3 text-[30px] font-semibold tracking-tight text-fg sm:text-[36px]">
            A server fell over. Fittingly.
          </h1>
          <p className="mt-3 text-[15px] text-muted">
            Something went wrong rendering this page. Your progress is safe. Retrying usually works; if it doesn&apos;t,
            head back to the course.
          </p>
          {digest && <p className="mt-3 font-mono text-[11.5px] text-subtle">Error id: {digest}</p>}
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button onClick={() => retry()}>
              <RotateCcw className="size-4" aria-hidden /> Try again
            </Button>
            <Link href="/learn" className={buttonClass("secondary", "md")}>
              Go to the course
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
