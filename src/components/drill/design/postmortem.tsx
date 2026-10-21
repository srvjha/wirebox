"use client";

import { useMutation } from "@tanstack/react-query";
import { LoaderCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { useSession } from "@/lib/auth-client";

export type PostmortemInput = { drill: string; step: number; design: string; scenario: string; result: string };
type Reply = { text: string; source: "ai" | "rules"; cached?: boolean };

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function Postmortem({ input, returnTo }: { input: PostmortemInput; returnTo: string }) {
  const { data: session, isPending } = useSession();
  const ask = useMutation({
    mutationFn: async (): Promise<Reply> => {
      const res = await fetch("/api/postmortem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new HttpError(res.status, body.error ?? "Something went wrong.");
      return body as Reply;
    },
  });

  const signIn = (
    <div className="rounded-xl border border-info/30 bg-info/10 p-3 text-[12.5px] text-muted">
      <p>
        <span className="font-medium text-fg">The AI mentor needs you signed in.</span> It reads your design and points
        at the bottleneck, without handing you the answer. Free, like everything here.
      </p>
      <Link href={`/sign-in?next=${encodeURIComponent(returnTo)}`} className={buttonClass("secondary", "sm", "mt-2")}>
        Sign in
      </Link>
    </div>
  );

  if (ask.data) {
    return (
      <div className="rounded-xl border border-info/30 bg-info/5 p-3.5">
        <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-info">
          <Sparkles className="size-3.5" /> {ask.data.source === "ai" ? "Mentor's read" : "What the numbers say"}
        </p>
        <div className="space-y-2 text-[13px] leading-relaxed text-muted [&_strong]:text-fg">
          {ask.data.text.split(/\n\n+/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    );
  }
  if (ask.error instanceof HttpError && ask.error.status === 401) return signIn;
  if (!isPending && !session) return signIn;

  return (
    <div>
      <button
        type="button"
        disabled={ask.isPending}
        onClick={() => {
          track("postmortem_requested", { drill: input.drill, step: input.step });
          ask.mutate();
        }}
        className={buttonClass("outline", "sm", "w-full")}
      >
        {ask.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-info" />}
        {ask.isPending ? "Reading your design…" : "Why did this fail?"}
      </button>
      {ask.error && <p className="mt-1.5 text-[12px] text-err">{ask.error.message}</p>}
    </div>
  );
}
