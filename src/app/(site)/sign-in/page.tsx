import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cloud, LineChart } from "lucide-react";
import { SignInForm, type Provider } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to sync your Wirebox progress across devices. The course itself never needs an account.",
};

/** Social providers are configured by env at runtime, so read them per request. */
async function Form() {
  await connection();
  const providers: Provider[] = [];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) providers.push("google");
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) providers.push("github");
  return <SignInForm providers={providers} />;
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
  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1fr_420px] lg:gap-16">
      <div className="lg:pt-6">
        <p className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase">Optional account</p>
        <h1 className="mt-3 text-[32px] leading-[1.1] font-semibold tracking-tight text-balance text-fg sm:text-[40px]">
          Keep your progress on every device.
        </h1>
        <p className="mt-4 max-w-md text-[15.5px] leading-relaxed text-muted">
          You never need an account to learn. Every lesson and lab works signed out, and your progress saves in this
          browser.
        </p>
        <ul className="mt-8 max-w-md space-y-4 text-[14px] text-muted">
          <li className="flex gap-3">
            <Cloud className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <span>
              <span className="text-fg">Sync.</span> Finished lessons and lab designs follow you from laptop to phone.
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
