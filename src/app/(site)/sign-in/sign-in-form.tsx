"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ArrowRight, CircleAlert, Loader2, UserRound } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { signIn, signOut, signUp, useSession } from "@/lib/auth-client";
import { track } from "@/lib/analytics";
import { isGuestEmail } from "@/lib/guest";
import { cn } from "@/lib/utils";

export type Provider = "google" | "github";
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

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  );
}

const providerMeta: Record<Provider, { label: string; icon: () => React.ReactNode }> = {
  google: { label: "Google", icon: GoogleIcon },
  github: { label: "GitHub", icon: GitHubIcon },
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

export function SignInForm({ providers, guest = false }: { providers: Provider[]; guest?: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>(params.get("mode") === "sign-up" ? "sign-up" : "sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "email" | "guest" | Provider>(null);
  const { data: session, isPending } = useSession();

  if (!isPending && session?.user) {
    return (
      <div>
        <h2 className="text-[18px] font-semibold text-fg">You&apos;re signed in</h2>
        <p className="mt-1.5 text-[14px] text-muted">
          {isGuestEmail(session.user.email) ? (
            <>As a guest. Your progress is saved to this guest account.</>
          ) : (
            <>
              As <span className="text-fg">{session.user.email}</span>. Your progress syncs automatically.
            </>
          )}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href={next} className={buttonClass("primary", "md")}>
            Continue <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Button
            variant="ghost"
            onClick={async () => {
              track("signed_out", {});
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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy("email");
    if (mode === "sign-up") track("sign_up_started", { method: "email" });
    else track("sign_in_started", { method: "email" });

    const res =
      mode === "sign-up"
        ? await signUp.email({ name: name.trim() || email.split("@")[0], email, password })
        : await signIn.email({ email, password });

    if (res.error) {
      setBusy(null);
      const msg = res.error.message ?? "";
      if (res.error.status === 401 || /invalid/i.test(msg))
        setError("That email and password don't match. Check them, or create an account instead.");
      else if (/exist/i.test(msg)) setError("An account with this email already exists. Sign in instead.");
      else setError(msg || "Something went wrong. Please try again.");
      return;
    }
    router.replace(next);
    router.refresh();
  };

  const social = async (provider: Provider) => {
    setError(null);
    setBusy(provider);
    track("sign_in_started", { method: provider });
    const res = await signIn.social({ provider, callbackURL: next });
    if (res?.error) {
      setBusy(null);
      setError(res.error.message ?? `Couldn't start ${providerMeta[provider].label} sign-in.`);
    }
  };

  const asGuest = async () => {
    setError(null);
    setBusy("guest");
    track("sign_in_started", { method: "guest" });
    const res = await signIn.anonymous();
    if (res?.error) {
      setBusy(null);
      setError(res.error.message ?? "Couldn't start a guest session.");
      return;
    }
    router.replace(next);
    router.refresh();
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

      {guest && (
        <div className="mt-4">
          <Button type="button" variant="outline" className="w-full" disabled={!!busy} onClick={asGuest}>
            {busy === "guest" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <UserRound className="size-4" aria-hidden />
            )}
            Continue as guest
          </Button>
          <p className="mt-1.5 text-center text-[12px] text-subtle">
            A throwaway account for trying things out. No email or password.
          </p>
        </div>
      )}

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
