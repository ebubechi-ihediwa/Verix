import AuthForm from "@/components/auth/AuthForm";

export const metadata = { title: "Sign in · Verix Console" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
