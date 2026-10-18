/** Labs run full-screen: no site header or footer, the player brings its own bar. */
export default function LabLayout({ children }: LayoutProps<"/labs/[slug]">) {
  return <div className="flex min-h-dvh flex-1 flex-col">{children}</div>;
}
