import { SignIn } from "@clerk/nextjs";
import { BarChart3, CalendarClock, FileText, MessageSquareText, ShieldCheck } from "lucide-react";

const previewItems = [
  { label: "AI imported clients", value: "24", tone: "violet" },
  { label: "Invoices ready", value: "₹1.8L", tone: "emerald" },
  { label: "Contracts drafted", value: "6", tone: "fuchsia" },
];

const activity = [
  { icon: MessageSquareText, title: "Chat handled follow-up", meta: "Rahul · tomorrow call" },
  { icon: FileText, title: "Contract ready to review", meta: "Website Redesign" },
  { icon: CalendarClock, title: "Meeting synced", meta: "Google Calendar" },
];

export default function LoginPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fbfbfd] text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(124,58,237,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(124,58,237,0.07)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl items-center gap-10 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_460px] lg:px-10">
        <section className="hidden lg:block">
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200 bg-white text-sm font-bold text-violet-700 shadow-sm dark:border-violet-900 dark:bg-zinc-900 dark:text-violet-300">
              SO
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">SoloOS</p>
              <p className="text-xs text-zinc-500">Freelance command center</p>
            </div>
          </div>

          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-violet-100 bg-white px-2.5 py-1 text-[11px] font-medium text-violet-700 shadow-sm dark:border-violet-900 dark:bg-zinc-900 dark:text-violet-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Built for client work, payments, contracts, and follow-ups
            </div>
            <h1 className="text-4xl font-semibold tracking-normal text-zinc-950 dark:text-white">
              Run your freelance business from one serious workspace.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Chat-first automation for clients, projects, invoices, contracts, reminders, and financial insight. Quiet UI, fast workflows, and no busy admin screens.
            </p>
          </div>

          <div className="mt-10 max-w-2xl rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl shadow-violet-100/50 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none">
            <div className="mb-4 flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Today in SoloOS</p>
                <p className="text-xs text-zinc-500">AI has the workspace context before acting</p>
              </div>
              <div className="rounded-md border border-violet-100 bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-700 dark:border-violet-900 dark:bg-violet-950/35 dark:text-violet-300">
                Live workspace
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {previewItems.map((item) => (
                <div key={item.label} className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                  <p className="text-xs text-zinc-500">{item.label}</p>
                  <p className={`mt-2 text-lg font-semibold ${item.tone === "emerald" ? "text-emerald-600 dark:text-emerald-300" : item.tone === "fuchsia" ? "text-fuchsia-600 dark:text-fuchsia-300" : "text-violet-700 dark:text-violet-300"}`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_190px]">
              <div className="space-y-2">
                {activity.map(({ icon: Icon, title, meta }) => (
                  <div key={title} className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-100 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">{title}</p>
                      <p className="truncate text-[11px] text-zinc-500">{meta}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-violet-100 bg-violet-50 p-3 dark:border-violet-900 dark:bg-violet-950/25">
                <div className="mb-3 flex items-center gap-2 text-xs font-medium text-violet-800 dark:text-violet-200">
                  <BarChart3 className="h-4 w-4" />
                  Business health
                </div>
                <div className="space-y-2">
                  <div className="h-2 rounded-md bg-white dark:bg-zinc-900">
                    <div className="h-2 w-4/5 rounded-md bg-violet-600" />
                  </div>
                  <div className="h-2 rounded-md bg-white dark:bg-zinc-900">
                    <div className="h-2 w-3/5 rounded-md bg-fuchsia-500" />
                  </div>
                  <div className="h-2 rounded-md bg-white dark:bg-zinc-900">
                    <div className="h-2 w-2/3 rounded-md bg-emerald-500" />
                  </div>
                </div>
                <p className="mt-3 text-[11px] leading-5 text-violet-700 dark:text-violet-300">
                  Revenue, expenses, and project hourly rate in one view.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-7 text-center lg:hidden">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-violet-200 bg-white text-sm font-bold text-violet-700 shadow-sm">
              SO
            </div>
            <h1 className="text-2xl font-semibold text-zinc-950 dark:text-white">SoloOS</h1>
            <p className="mt-1 text-sm text-zinc-500">Freelance command center</p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl shadow-violet-100/70 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none">
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
                  card: "w-full border-0 shadow-none bg-transparent p-4 sm:p-6",
                  header: "text-left",
                  headerTitle: "text-xl font-semibold text-zinc-950 dark:text-zinc-100",
                  headerSubtitle: "text-sm text-zinc-500 dark:text-zinc-400",
                  socialButtonsBlockButton:
                    "h-10 rounded-lg border border-violet-200 bg-white text-sm font-medium text-zinc-800 hover:bg-violet-50 dark:border-violet-900 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-violet-950/30",
                  dividerLine: "bg-zinc-200 dark:bg-zinc-800",
                  dividerText: "text-zinc-400",
                  formFieldLabel: "text-xs font-medium text-zinc-500 dark:text-zinc-400",
                  formFieldInput:
                    "h-10 rounded-lg border-zinc-200 bg-white text-sm text-zinc-900 shadow-none focus:border-violet-400 focus:ring-violet-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100",
                  formButtonPrimary:
                    "h-10 rounded-lg bg-violet-600 text-sm font-medium text-white shadow-none hover:bg-violet-700 focus:ring-violet-500/30",
                  footerActionLink: "text-violet-700 hover:text-violet-800 dark:text-violet-300",
                  identityPreviewEditButton: "text-violet-700 dark:text-violet-300",
                  formResendCodeLink: "text-violet-700 dark:text-violet-300",
                  otpCodeFieldInput:
                    "rounded-lg border-zinc-200 focus:border-violet-400 focus:ring-violet-500/20 dark:border-zinc-800 dark:bg-zinc-950",
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
