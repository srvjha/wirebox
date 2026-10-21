import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Cloud, LineChart, Sparkles } from "lucide-react";
import { AUTH_ENABLED } from "@/lib/features";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { SignInForm, type Provider } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to get AI debriefs on your drill designs and sync your progress across devices. The course itself never needs an account.",
};

/** Ask Supabase which social providers are switched on, so the page never offers a dead button. */
async function enabledProviders(): Promise<Provider[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_KEY },
      next: { revalidate: 300 },
    });
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    return settings.external?.google ? ["google"] : [];
  } catch {
    return [];
  }
}

async function Form() {
  await connection();
  return <SignInForm providers={await enabledProviders()} />;
}

function FormSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-10 animate-pulse rounded-xl bg-surface-2" />
      <div className="h-10 animate-pulse rounded-xl bg-surface-2" />
      <div className="h-10 animate-pulse rounded-xl bg-surface-2" />
    </div>
  );
}

export default function SignInPage() {
  if (!AUTH_ENABLED) notFound();
  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1fr_420px] lg:gap-16">
      <div className="lg:pt-6">
        <p className="text-[13px] text-accent">Optional account</p>
        <h1 className="mt-3 text-[32px] leading-[1.1] font-semibold tracking-tight text-balance text-fg sm:text-[40px]">
          Unlock the AI mentor and keep your progress everywhere.
        </h1>
        <p className="mt-4 max-w-md text-[15.5px] leading-relaxed text-muted">
          You never need an account to learn. Every lesson and drill works signed out, and your progress saves in this
          browser. The AI mentor is the one thing that needs you signed in.
        </p>
        <ul className="mt-8 max-w-md space-y-4 text-[14px] text-muted">
          <li className="flex gap-3">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <span>
              <span className="text-fg">AI mentor.</span> After a load test, ask why your design failed. It reads your
              design and points at the bottleneck. Signing in keeps it free by keeping bots from running up the bill.
            </span>
          </li>
          <li className="flex gap-3">
            <Cloud className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <span>
              <span className="text-fg">Sync.</span> Finished lessons and drill designs follow you from laptop to phone.
            </span>
          </li>
          <li className="flex gap-3">
            <LineChart className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <span>
              <span className="text-fg">Count.</span> Accounts help us see how many people are learning, which keeps a
              free project going. No newsletters, no spam.
            </span>
          </li>
        </ul>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-7">
        <Suspense fallback={<FormSkeleton />}>
          <Form />
        </Suspense>
      </div>
    </div>
  );
}
