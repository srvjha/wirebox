/** Drills run full-screen: no site header or footer, the player brings its own bar. */
export default function DrillLayout({ children }: LayoutProps<"/drills/[slug]">) {
  return <div className="flex min-h-dvh flex-1 flex-col">{children}</div>;
}
