import { SignIn } from "@clerk/nextjs";
import { BarChart3, CalendarClock, FileText, MessageSquareText, Sparkles, Users } from "lucide-react";

function SoloOsLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-xl border border-violet-200 bg-white shadow-sm shadow-violet-100 dark:border-violet-900 dark:bg-zinc-900">
        <div className="h-5 w-5 rounded-md bg-violet-600" />
      </div>
      {!compact && (
        <div>
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">SoloOS</p>
          <p className="text-xs text-zinc-500">Freelance command center</p>
        </div>
      )}
    </div>
  );
}

function MiniDashboard() {
  return (
    <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl shadow-violet-100/50 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none">
      <div className="mb-4 flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <SoloOsLogo compact />
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Workspace</p>
            <p className="text-xs text-zinc-500">Client operations today</p>
          </div>
        </div>
        <span className="rounded-md border border-violet-100 bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-700 dark:border-violet-900 dark:bg-violet-950/35 dark:text-violet-300">
          Chat ready
        </span>
      </div>

      <div className="mb-4 rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2 dark:border-violet-900 dark:bg-violet-950/25">
        <div className="flex items-center gap-2 text-xs text-violet-800 dark:text-violet-200">
          <Sparkles className="h-3.5 w-3.5" />
          <span>“Show revenue vs expenses and draft Rahul’s contract”</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ["Active clients", "24", "text-violet-700 dark:text-violet-300"],
          ["Revenue", "₹1.8L", "text-emerald-600 dark:text-emerald-300"],
          ["Due this week", "₹42K", "text-fuchsia-600 dark:text-fuchsia-300"],
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className={`mt-2 text-lg font-semibold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="rounded-xl border border-zinc-100 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-violet-600" />
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Clients</p>
            </div>
            <span className="rounded-md border border-violet-100 bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700 dark:border-violet-900 dark:bg-violet-950/35 dark:text-violet-300">
              Real data
            </span>
          </div>
          <div className="space-y-2">
            {[
              ["Rahul Bisht", "Website Redesign", "₹35K"],
              ["Priya Sharma", "Invoice overdue", "₹18K"],
              ["Acme Studio", "Contract review", "₹72K"],
            ].map(([name, meta, value]) => (
              <div key={name} className="flex items-center gap-3 rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-violet-100 bg-violet-50 text-[11px] font-semibold text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300">
                  {name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">{name}</p>
                  <p className="truncate text-[11px] text-zinc-500">{meta}</p>
                </div>
                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-zinc-100 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-800 dark:text-zinc-200">
              <BarChart3 className="h-4 w-4 text-violet-600" />
              P&L
            </div>
            <div className="flex h-28 items-end gap-2">
              {[42, 64, 52, 78, 69, 88].map((height, index) => (
                <div key={index} className="flex flex-1 flex-col justify-end">
                  <div
                    className="rounded-t-md bg-violet-600"
                    style={{ height: `${height}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-100 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-fuchsia-600" />
              <div>
                <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">Contract draft</p>
                <p className="text-[11px] text-zinc-500">Ready for signature</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-zinc-100 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-emerald-600" />
              <div>
                <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">Meeting reminder</p>
                <p className="text-[11px] text-zinc-500">Client + you emailed</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#fbfbfd] text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl items-center gap-10 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-10">
        <section className="hidden lg:block">
          <div className="mb-10">
            <SoloOsLogo />
          </div>

          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-violet-100 bg-white px-2.5 py-1 text-[11px] font-medium text-violet-700 shadow-sm dark:border-violet-900 dark:bg-zinc-900 dark:text-violet-300">
              <MessageSquareText className="h-3.5 w-3.5" />
              Client work, invoices, contracts, reminders, and insights
            </div>
            <h1 className="text-4xl font-semibold tracking-normal text-zinc-950 dark:text-white">
              A calm operating system for serious freelance work.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Import real clients, automate follow-ups, draft documents, track projects, and understand money from one chat-first workspace.
            </p>
          </div>

          <div className="mt-10">
            <MiniDashboard />
          </div>
        </section>

        <section className="mx-auto w-full max-w-[420px]">
          <div className="mb-7 flex flex-col items-center text-center lg:hidden">
            <SoloOsLogo compact />
            <h1 className="mt-3 text-2xl font-semibold text-zinc-950 dark:text-white">SoloOS</h1>
            <p className="mt-1 text-sm text-zinc-500">Freelance command center</p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-violet-100/70 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none">
            <SignIn
              routing="path"
              path="/login"
              forceRedirectUrl="/"
              appearance={{
                variables: {
                  colorPrimary: "#7c3aed",
                  colorText: "#18181b",
                  colorTextSecondary: "#71717a",
                  borderRadius: "0.75rem",
                  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                },
                elements: {
                  rootBox: "w-full",
                  cardBox: "w-full shadow-none",
                  card: "w-full max-w-none border-0 shadow-none bg-transparent p-6 sm:p-7",
                  main: "w-full",
                  header: "text-left",
                  headerTitle: "text-xl font-semibold text-zinc-950 dark:text-zinc-100",
                  headerSubtitle: "text-sm text-zinc-500 dark:text-zinc-400",
                  socialButtons: "w-full",
                  socialButtonsBlockButton:
                    "h-10 w-full rounded-lg border border-violet-200 bg-white text-sm font-medium text-zinc-800 hover:bg-violet-50 dark:border-violet-900 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-violet-950/30",
                  dividerLine: "bg-zinc-200 dark:bg-zinc-800",
                  dividerText: "text-zinc-400",
                  form: "w-full",
                  formField: "w-full",
                  formFieldLabel: "text-xs font-medium text-zinc-500 dark:text-zinc-400",
                  formFieldInput:
                    "h-10 w-full rounded-lg border-zinc-200 bg-white text-sm text-zinc-900 shadow-none focus:border-violet-400 focus:ring-violet-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100",
                  formButtonPrimary:
                    "h-10 w-full rounded-lg bg-violet-600 text-sm font-medium text-white shadow-none hover:bg-violet-700 focus:ring-violet-500/30",
                  footer: "bg-zinc-50 px-7 py-4 dark:bg-zinc-950/50",
                  footerActionLink: "text-violet-700 hover:text-violet-800 dark:text-violet-300",
                  identityPreviewEditButton: "text-violet-700 dark:text-violet-300",
                  formResendCodeLink: "text-violet-700 dark:text-violet-300",
                  otpCodeFieldInput:
                    "rounded-lg border-zinc-200 focus:border-violet-400 focus:ring-violet-500/20 dark:border-zinc-800 dark:bg-zinc-950",
                  footerPages: "bg-zinc-50 dark:bg-zinc-950/50",
                },
              }}
            />
          </div>
          <p className="mt-4 text-center text-[11px] leading-5 text-zinc-500">
            Your workspace data stays scoped to your logged-in account.
          </p>
        </section>
      </div>
    </main>
  );
}
