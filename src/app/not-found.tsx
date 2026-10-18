import Link from "next/link";
import { Box, Diagram, Tag, Wire } from "@/components/diagram/kit";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <Diagram w={420} h={110} className="my-0" label="A request reaches the load balancer but finds no route">
            <Box x={6} y={29} w={110} label="You" icon="user" />
            <Box x={156} y={29} w={110} label="Router" icon="lb" />
            <Box x={306} y={29} w={108} label="???" icon="server" tone="err" dashed dim />
            <Wire
              points={[
                [116, 55],
                [156, 55],
              ]}
              tone="req"
              flow
            />
            <Wire
              points={[
                [266, 55],
                [306, 55],
              ]}
              tone="err"
              dashed
            />
            <Tag x={286} y={22} tone="err">
              404
            </Tag>
          </Diagram>
          <p className="mt-10 font-mono text-[11px] tracking-[0.14em] text-accent uppercase">404 · no route</p>
          <h1 className="mt-3 text-[30px] font-semibold tracking-tight text-fg sm:text-[36px]">
            This page doesn&apos;t exist.
          </h1>
          <p className="mt-3 text-[15px] text-muted">
            The request made it here, but nothing is listening on this path. It may have moved, or it was never built.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/learn" className={buttonClass("primary", "md")}>
              Go to the course
            </Link>
            <Link href="/" className={buttonClass("secondary", "md")}>
              Back home
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
