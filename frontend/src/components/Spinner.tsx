import { Loader2 } from "lucide-react";

export function Spinner({ className = "h-6 w-6" }: { className?: string }) {
  return <Loader2 className={`animate-spin text-zinc-400 ${className}`} />;
}

export function FullScreenSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function PageSpinner() {
  return (
    <div className="flex justify-center py-16">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
