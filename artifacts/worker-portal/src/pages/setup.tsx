import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HardHat, Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";

export default function SetupPage({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/worker-portal/setup-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
        credentials: "include",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        if (res.status === 410) {
          setInvalid(true);
          return;
        }
        throw new Error(json.error ?? "Something went wrong");
      }
      setDone(true);
      setTimeout(() => {
        const base = import.meta.env.BASE_URL;
        window.location.href = base.endsWith("/") ? base : base + "/";
      }, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  }

  if (invalid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-bold">Link Expired or Already Used</h1>
          <p className="text-sm text-muted-foreground mt-2 mb-6">
            This setup link has expired or has already been used. Please ask your administrator to send a new one.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              const base = import.meta.env.BASE_URL;
              window.location.href = base.endsWith("/") ? base : base + "/";
            }}
          >
            Go to sign in
          </Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold">Password Set!</h1>
          <p className="text-sm text-muted-foreground mt-2">Taking you to Worker Portal…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center mb-3">
            <HardHat className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold">Worker Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">Set your password to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 border rounded-xl p-6 bg-card shadow-sm">
          <div className="space-y-1.5">
            <Label htmlFor="pw-new">New Password</Label>
            <div className="relative">
              <Input
                id="pw-new"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Choose a password (min 8 chars)"
                autoComplete="new-password"
                required
                minLength={8}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pw-confirm">Confirm Password</Label>
            <Input
              id="pw-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Setting up…" : "Set password & continue"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Already have a password?{" "}
          <button
            type="button"
            className="underline hover:text-foreground"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete("setup-token");
              window.location.href = url.toString();
            }}
          >
            Sign in instead
          </button>
        </p>
      </div>
    </div>
  );
}
