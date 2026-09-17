"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function LoginForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  return <form method="post" className="space-y-4" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await signIn("credentials", { email: data.get("email"), password: data.get("password"), redirect: false });
      if (result?.error) setError("Email o contraseña incorrectos, o cuenta deshabilitada.");
      else window.location.assign("/inicio");
    } catch { setError("No se pudo iniciar sesión. Intentá nuevamente."); }
    finally { setBusy(false); }
  }}><label className="block text-sm">Email<input className="mt-1 w-full rounded-lg border p-3" name="email" type="email" autoComplete="username" required /></label><label className="block text-sm">Contraseña<div className="relative mt-1"><input className="w-full rounded-lg border p-3 pr-11" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={128} /><button type="button" onClick={() => setShowPassword(current => !current)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button disabled={busy} className="w-full rounded-lg bg-[#062b5b] p-3 font-semibold text-white disabled:opacity-50">{busy ? "Ingresando…" : "Iniciar sesión"}</button></form>;
}
