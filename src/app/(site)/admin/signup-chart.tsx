/** Daily sign-ups as plain CSS bars, with a screen-reader table of the same numbers. */
export function SignupChart({ series }: { series: { day: string; n: number }[] }) {
  const max = Math.max(1, ...series.map((d) => d.n));
  const total = series.reduce((n, d) => n + d.n, 0);
  const fmt = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <figure>
      <div className="flex gap-2">
        <div className="relative flex h-44 w-7 shrink-0 flex-col-reverse justify-between font-mono text-[10.5px] text-subtle">
          {ticks.map((t) => (
            <span key={t} className="leading-none tabular-nums">
              {t}
            </span>
          ))}
        </div>
        <div className="relative h-44 flex-1">
          <div aria-hidden className="absolute inset-0 flex flex-col justify-between">
            {ticks.map((t) => (
              <div key={t} className="border-t border-dashed border-line" />
            ))}
          </div>
          <div aria-hidden className="absolute inset-0 flex items-end gap-[3px]">
            {series.map((d) => (
              <div key={d.day} className="group relative flex h-full flex-1 items-end">
                <div
                  className="w-full rounded-t-[3px] bg-accent/80 transition-colors group-hover:bg-accent"
                  style={{ height: d.n ? `${Math.max(3, (d.n / max) * 100)}%` : "2px", opacity: d.n ? 1 : 0.25 }}
                />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] whitespace-nowrap text-fg group-hover:block">
                  {fmt(d.day)} · {d.n}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div aria-hidden className="mt-2 ml-9 flex justify-between font-mono text-[10.5px] text-subtle">
        <span>{fmt(series[0].day)}</span>
        <span>{fmt(series[series.length - 1].day)}</span>
      </div>
      <figcaption className="mt-3 text-[12.5px] text-muted">
        {total} sign-ups in the last 30 days, peak {max === 1 && total === 0 ? 0 : max} in a day.
      </figcaption>
      <table className="sr-only">
        <caption>Sign-ups per day, last 30 days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Sign-ups</th>
          </tr>
        </thead>
        <tbody>
          {series.map((d) => (
            <tr key={d.day}>
              <td>{fmt(d.day)}</td>
              <td>{d.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
