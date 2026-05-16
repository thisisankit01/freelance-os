import { SignUp } from "@clerk/nextjs";
import { AuthShell, authClerkAppearance } from "@/components/auth/AuthShell";

export default function SignUpPage() {
  return (
    <AuthShell mode="sign-up">
      <SignUp
        appearance={authClerkAppearance}
        forceRedirectUrl="/"
        path="/sign-up"
        routing="path"
        signInUrl="/login"
      />
    </AuthShell>
  );
}
