import { LoginChooser } from "@/components/LoginChooser";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <LoginChooser />
    </main>
  );
}
