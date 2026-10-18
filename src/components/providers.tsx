"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { identify, resetIdentity } from "@/lib/analytics";
import { useSession } from "@/lib/auth-client";

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  const make = () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });
  // Fresh client per server render; one shared client in the browser.
  if (typeof window === "undefined") return make();
  browserQueryClient ??= make();
  return browserQueryClient;
}

function IdentifyUser() {
  const { data } = useSession();
  const user = data?.user;
  useEffect(() => {
    if (user) identify({ id: user.id, email: user.email, name: user.name });
  }, [user]);
  useEffect(() => {
    if (data === null) resetIdentity();
  }, [data]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <IdentifyUser />
      {children}
    </QueryClientProvider>
  );
}
