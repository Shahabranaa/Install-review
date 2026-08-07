// @ts-nocheck
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SetPasswordPage() {
  const [, navigate] = useLocation();

  // Read token from ?token= query param
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const mismatch = confirm.length > 0 && password !== confirm;
  const valid = token && password.length >= 6 && password === confirm;

  async function handleSubmit() {
    if (!valid) return;
    setStatus("loading");
    try {
      const res = await fetch(`${API_BASE}/api/auth/accept-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
      } else {
        setStatus("done");
      }
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm w-full text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
          <h1 className="text-lg font-semibold">Invalid Link</h1>
          <p className="text-sm text-muted-foreground">This invitation link is missing or malformed. Please ask your administrator to resend the invite.</p>
        </div>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
          <h1 className="text-xl font-semibold">Password set!</h1>
          <p className="text-sm text-muted-foreground">Your account is now active. You can sign in with your username and the password you just created.</p>
          <Button className="w-full" onClick={() => navigate("/login")}>Go to Sign In</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <svg viewBox="0 0 24 24" className="w-7 h-7 text-primary fill-none stroke-current stroke-2">
              <path d="M12 2a5 5 0 015 5v2H7V7a5 5 0 015-5z" />
              <rect x="3" y="9" width="18" height="13" rx="2" />
              <circle cx="12" cy="15" r="1.5" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold">Set your password</h1>
          <p className="text-sm text-muted-foreground">Choose a password to activate your DPR Timesheets account.</p>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>New Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              disabled={status === "loading"}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm Password</Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={mismatch ? "border-destructive" : undefined}
              disabled={status === "loading"}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            {mismatch && <p className="text-xs text-destructive">Passwords don't match</p>}
          </div>

          {status === "error" && (
            <div className="flex gap-2 items-start rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{errorMsg}</p>
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!valid || status === "loading"}
          >
            {status === "loading" && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Activate Account
          </Button>
        </div>
      </div>
    </div>
  );
}
