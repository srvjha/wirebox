import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="relative z-10 flex-1 bg-bg">{children}</main>
      <SiteFooter />
    </>
  );
}
