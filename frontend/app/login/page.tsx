"use client";
import { useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../../src/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    if (!email.trim() || !password.trim()) { 
      setError("กรุณากรอกอีเมลและรหัสผ่าน"); 
      return; 
    }
    setError(null); 
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.push("/");
    } catch (err: unknown) {
      console.error(err);
      const authError = err as { code?: string };
      if (authError.code === "auth/invalid-credential" || authError.code === "auth/user-not-found" || authError.code === "auth/wrong-password") {
        setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      } else if (authError.code === "auth/invalid-email") {
        setError("รูปแบบอีเมลไม่ถูกต้อง");
      } else if (authError.code === "auth/too-many-requests") {
        setError("คุณพยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่");
      } else {
        setError("เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองอีกครั้ง");
      }
    } finally { 
      setLoading(false); 
    }
  };

  const handleForgotPassword = async () => {
    setSuccessMsg(null);
    if (!email.trim()) {
      setError("กรุณากรอกอีเมลของคุณในช่องด้านบน เพื่อรีเซ็ตรหัสผ่าน");
      return;
    }
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSuccessMsg("ลิงก์สำหรับรีเซ็ตรหัสผ่านถูกส่งไปยังอีเมลของคุณแล้ว");
    } catch (err: unknown) {
      console.error(err);
      const authError = err as { code?: string };
      if (authError.code === "auth/user-not-found") {
        setError("ไม่พบบัญชีผู้ใช้ที่ใช้อีเมลนี้");
      } else if (authError.code === "auth/invalid-email") {
        setError("รูปแบบอีเมลไม่ถูกต้อง");
      } else {
        setError("เกิดข้อผิดพลาดในการส่งลิงก์รีเซ็ตรหัสผ่าน");
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      router.push("/");
    } catch (err: unknown) {
      console.error(err);
      setError("เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)] animate-in zoom-in-95 fade-in duration-300">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-4 text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-500 to-teal-400 bg-clip-text text-transparent hover:opacity-80 transition">
            EduGen
          </Link>
          <h2 className="text-3xl font-extrabold bg-gradient-to-r from-blue-500 via-teal-400 to-emerald-400 bg-clip-text text-transparent mb-2">
            ยินดีต้อนรับกลับมา
          </h2>
          <p className="text-slate-500 text-sm">
            เข้าสู่ระบบเพื่อใช้งาน EduGen
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-center gap-3 font-medium">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            {error}
          </div>
        )}
        
        {successMsg && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-600 flex items-center gap-3 font-medium">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            {successMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-500 pl-1">อีเมล</label>
            <input 
              type="email" 
              className="w-full rounded-2xl bg-white/50 border border-slate-200 px-4 py-3.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="you@example.com" 
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between pl-1 pr-1">
              <label className="text-sm font-medium text-slate-500">รหัสผ่าน</label>
              <button 
                type="button" 
                onClick={handleForgotPassword}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                ลืมรหัสผ่าน?
              </button>
            </div>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                className="w-full rounded-2xl bg-white/50 border border-slate-200 px-4 py-3.5 pr-12 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="ระบุรหัสผ่านของคุณ" 
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full mt-6 rounded-2xl bg-gradient-to-r from-blue-600 to-emerald-500 px-4 py-3.5 font-semibold text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-emerald-400 hover:shadow-blue-500/40 transition-all disabled:opacity-50 flex justify-center items-center gap-2"
          >
            {loading ? (
              <span className="animate-pulse">กำลังเข้าสู่ระบบ...</span>
            ) : (
              "เข้าสู่ระบบ"
            )}
          </button>

          <div className="relative flex items-center justify-center mt-6 py-2">
            <span className="absolute bg-white px-2 text-xs text-slate-400 font-medium z-10">หรือ</span>
            <div className="w-full h-px bg-slate-200"></div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full rounded-2xl bg-white border border-slate-200 px-4 py-3 font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-all disabled:opacity-50 flex justify-center items-center gap-3"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            เข้าสู่ระบบด้วย Google
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-500">
          ยังไม่มีบัญชีใช่ไหม?{" "}
          <Link href="/register" className="font-medium text-indigo-600 hover:text-indigo-500 hover:underline transition">
            สมัครสมาชิกที่นี่
          </Link>
        </div>
      </div>
    </div>
  );
}
