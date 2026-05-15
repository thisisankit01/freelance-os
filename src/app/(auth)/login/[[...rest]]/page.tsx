import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-zinc-800">SoloOS</h1>
          <p className="text-sm text-zinc-500 mt-1">
            AI-powered dashboard for freelancers
          </p>
        </div>
        <SignIn
          routing="path"
          path="/login"
          forceRedirectUrl="/"
          appearance={{
            elements: {
              card: "shadow-lg border border-zinc-200 rounded-2xl",
              headerTitle: "text-xl font-semibold",
              formButtonPrimary: "bg-violet-600 hover:bg-violet-700",
            },
          }}
        />
      </div>
    </div>
  );
}
