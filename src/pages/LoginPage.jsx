import { supabase } from "../lib/supabase";
import { DEFAULT_ALLOWED_DOMAINS } from "../utils/securityDefaults";

export default function LoginPage() {
  const loginWithGoogle = async () => {
    const isGithubPages = window.location.hostname === "sanghakbae.github.io";

    const redirectTo = isGithubPages
      ? `${window.location.origin}/vuln-mgmt-system/`
      : window.location.origin;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) {
      console.error("Google 로그인 실패:", error.message);
      alert(error.message);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.08),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(148,163,184,0.14),_transparent_28%)]" />

      <div className="relative w-full max-w-[440px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
        <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-5">
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] text-slate-500">
            VULNERABILITY MANAGEMENT
          </div>

          <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">
            취약점 관리 시스템
          </h1>

          <p className="mt-2 text-xs leading-5 text-slate-500">
            허용된 Google 계정으로 로그인하세요.
          </p>
        </div>

        <div className="space-y-4 px-6 py-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-medium text-slate-500">
              로그인 방식
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Google OAuth
              <span className="mx-1.5 text-slate-300">•</span>
              허용 도메인 `{DEFAULT_ALLOWED_DOMAINS.join('`, `')}`
            </div>
          </div>

          <button
            onClick={loginWithGoogle}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[11px] font-bold text-slate-900">
              G
            </span>
            Google 계정으로 로그인
          </button>

          <p className="text-center text-[11px] leading-5 text-slate-400">
            로그인되지 않으면 관리자에게 계정 허용 여부를 확인하세요.
          </p>
        </div>
      </div>
    </div>
  );
}
