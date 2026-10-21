"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ArrowRight, CircleAlert, Loader2, MailCheck } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { signIn, signOut, signUp, useSession } from "@/lib/auth-client";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export type Provider = "google";
type Mode = "sign-in" | "sign-up";

/** Only allow same-site relative redirects. */
function safeNext(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/learn";
  return raw;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

const providerMeta: Record<Provider, { label: string; icon: () => React.ReactNode }> = {
  google: { label: "Google", icon: GoogleIcon },
};

function Field({
  label,
  type,
  name,
  autoComplete,
  value,
  onChange,
  minLength,
  hint,
}: {
  label: string;
  type: string;
  name: string;
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
  minLength?: number;
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-fg">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-line bg-bg px-3 text-[14px] text-fg outline-none placeholder:text-subtle focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
      />
      {hint && <p className="mt-1 text-[12px] text-subtle">{hint}</p>}
    </div>
  );
}

export function SignInForm({ providers }: { providers: Provider[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>(params.get("mode") === "sign-up" ? "sign-up" : "sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") === "callback" ? "That sign-in link didn't work or has expired. Please try again." : null,
  );
  const [busy, setBusy] = useState<null | "email" | Provider>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const { data: session, isPending } = useSession();

  if (!isPending && session?.user) {
    return (
      <div>
        <h2 className="text-[18px] font-semibold text-fg">You&apos;re signed in</h2>
        <p className="mt-1.5 text-[14px] text-muted">
          As <span className="text-fg">{session.user.email}</span>. Your progress syncs automatically.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href={next} className={buttonClass("primary", "md")}>
            Continue <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Button
            variant="ghost"
            onClick={async () => {
              await signOut();
              router.refresh();
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  if (confirmFor) {
    return (
      <div>
        <MailCheck className="size-6 text-accent" aria-hidden />
        <h2 className="mt-3 text-[18px] font-semibold text-fg">Check your email</h2>
        <p className="mt-1.5 text-[14px] text-muted">
          We sent a confirmation link to <span className="text-fg">{confirmFor}</span>. Open it on this device to finish
          creating your account.
        </p>
        <Button variant="ghost" className="mt-6 w-full" onClick={() => setConfirmFor(null)}>
          Use a different email
        </Button>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy("email");
    track("sign_in_started", { method: "email", mode });

    const res =
      mode === "sign-up"
        ? await signUp.email({ name: name.trim() || email.split("@")[0], email, password, next })
        : { ...(await signIn.email({ email, password })), confirm: false };

    if (res.error) {
      setBusy(null);
      const msg = res.error.message ?? "";
      if (/invalid login credentials/i.test(msg))
        setError("That email and password don't match. Check them, or create an account instead.");
      else if (/already registered|already exists/i.test(msg))
        setError("An account with this email already exists. Sign in instead.");
      else if (/email not confirmed/i.test(msg)) setError("Confirm your email first: open the link we sent you.");
      else setError(msg || "Something went wrong. Please try again.");
      return;
    }
    if (res.confirm) {
      setBusy(null);
      setConfirmFor(email);
      return;
    }
    router.replace(next);
    router.refresh();
  };

  const social = async (provider: Provider) => {
    setError(null);
    setBusy(provider);
    track("sign_in_started", { method: provider, mode });
    const res = await signIn.social({ provider, callbackURL: next });
    if (res?.error) {
      setBusy(null);
      setError(res.error.message ?? `Couldn't start ${providerMeta[provider].label} sign-in.`);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Account"
        className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-bg p-1"
      >
        {(["sign-in", "sign-up"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={cn(
              "h-8 rounded-lg text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              mode === m ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
            )}
          >
            {m === "sign-in" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      {providers.length > 0 && (
        <>
          <div className="mt-6 grid gap-2">
            {providers.map((p) => {
              const M = providerMeta[p];
              return (
                <Button key={p} variant="secondary" disabled={!!busy} onClick={() => social(p)}>
                  {busy === p ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <M.icon />}
                  Continue with {M.label}
                </Button>
              );
            })}
          </div>
          <div className="my-6 flex items-center gap-3 text-[13px] text-subtle">
            <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={onSubmit} className={cn("space-y-4", providers.length === 0 && "mt-6")}>
        {mode === "sign-up" && (
          <Field label="Name" type="text" name="name" autoComplete="name" value={name} onChange={setName} />
        )}
        <Field label="Email" type="email" name="email" autoComplete="email" value={email} onChange={setEmail} />
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          value={password}
          onChange={setPassword}
          minLength={8}
          hint={mode === "sign-up" ? "At least 8 characters." : undefined}
        />

        {error && (
          <p
            role="alert"
            className="flex gap-2 rounded-xl border border-err/30 bg-err/10 px-3 py-2.5 text-[13px] text-err"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={!!busy}>
          {busy === "email" && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {mode === "sign-up" ? "Create account" : "Sign in"}
        </Button>
      </form>

      <p className="mt-5 text-center text-[13px] text-subtle">
        {mode === "sign-in" ? "New here? " : "Already have an account? "}
        <button
          type="button"
          onClick={() => switchMode(mode === "sign-in" ? "sign-up" : "sign-in")}
          className="text-accent underline-offset-3 hover:underline"
        >
          {mode === "sign-in" ? "Create an account" : "Sign in"}
        </button>
      </p>
      <p className="mt-3 text-center text-[12px] text-subtle">
        Or{" "}
        <Link href={next} className="underline underline-offset-3 hover:text-fg">
          keep learning without an account
        </Link>
        .
      </p>
    </div>
  );
}
