type ClickRow = {
  click_count: number;
  first_clicked_at: string;
  last_clicked_at: string;
  email_subscribers: { first_name: string | null; email: string } | { first_name: string | null; email: string }[] | null;
};

const formatWhen = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(value));

// Who pressed "Read the Full Teaching" in the email. A subscriber appears only after following the link,
// so this counts people who chose to read, not mail programs that loaded the message.
export async function TeachingEmailReaders({ supabase, teachingId, deliveredCount }: { supabase: any; teachingId: string; deliveredCount: number }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .from("email_teaching_clicks")
    .select("click_count, first_clicked_at, last_clicked_at, email_subscribers(first_name, email)")
    .eq("teaching_id", teachingId)
    .order("first_clicked_at", { ascending: true });
  const rows = (data ?? []) as ClickRow[];

  return (
    <section id="email-readers" className="mt-8 rounded-2xl border border-[#284a3b]/15 bg-white/70 p-5">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">Email readers</p>
      <h2 className="mt-2 text-2xl font-extrabold text-[#243d31]">Who clicked to read the full teaching</h2>
      {error ? <p role="alert" className="mt-3 text-sm font-bold text-[#a2472c]">The reader list could not be loaded.</p> : (
        <>
          <p className="mt-3 text-sm leading-6 text-[#607066]">
            {rows.length} {rows.length === 1 ? "subscriber has" : "subscribers have"} clicked{deliveredCount ? ` out of ${deliveredCount} emailed` : ""}. Opening the email is not counted, and neither is the Test Send.
          </p>
          {rows.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm text-[#385245]">
                <thead className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#946332]">
                  <tr><th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Email</th><th className="py-2 pr-4">First clicked</th><th className="py-2">Clicks</th></tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const subscriber = Array.isArray(row.email_subscribers) ? row.email_subscribers[0] : row.email_subscribers;
                    return (
                      <tr key={`${subscriber?.email}-${row.first_clicked_at}`} className="border-t border-[#284a3b]/10">
                        <td className="py-2 pr-4">{subscriber?.first_name || "—"}</td>
                        <td className="py-2 pr-4">{subscriber?.email ?? "Unknown"}</td>
                        <td className="py-2 pr-4">{formatWhen(row.first_clicked_at)}</td>
                        <td className="py-2">{row.click_count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
