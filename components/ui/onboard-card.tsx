"use client";

import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

interface OnboardCardProps {
  duration?: number;
  step1?: string;
  step2?: string;
  step3?: string;
}

const OnboardCard = ({
  duration = 3000,
  step1 = "Welcome Aboard",
  step2 = "Verifying Details",
  step3 = "Account Created",
}: OnboardCardProps) => {
  const [progress, setProgress] = useState(0);
  const [animateKey, setAnimateKey] = useState(0);

  useEffect(() => {
    const forward = setTimeout(() => setProgress(100), 100);
    const reset = setTimeout(() => {
      setAnimateKey((k) => k + 1);
    }, duration + 2000);

    return () => {
      clearTimeout(forward);
      clearTimeout(reset);
    };
  }, [animateKey, duration]);

  return (
    <div
      className={cn(
        "relative",
        "flex flex-col items-center justify-center gap-1 p-1",
      )}
    >
      <div className="flex min-w-[250px] scale-[0.9] flex-col justify-center gap-2 rounded-md border border-[var(--border2)] bg-[var(--card2)] py-2 pl-3 pr-16 opacity-80">
        <div className="flex items-center justify-start gap-2 text-xs text-[var(--text)]">
          <div>
            <Loader2 className="w-4 h-4" />
          </div>
          <div>{step3}</div>
        </div>
        <div
          className={`ml-5 h-1.5 w-[100%] overflow-hidden rounded-full bg-[var(--border)]`}
        ></div>
      </div>
      <div className="flex min-w-[250px] flex-col justify-center gap-2 rounded-md border border-[var(--border2)] bg-[var(--card2)] py-2 pl-3 pr-16">
        <div className="flex items-center justify-start gap-1.5 text-xs text-[var(--text)]">
          <div className="animate-spin">
            <Loader2 className="w-4 h-4" />
          </div>
          <div>{step2}</div>
        </div>
        <div
          className={`ml-5 h-1.5 w-[100%] overflow-hidden rounded-full bg-[var(--border)]`}
        >
          <motion.div
            key={animateKey}
            className="h-full bg-[var(--ok)]"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: duration / 1000, ease: "easeInOut" }}
          />
        </div>
      </div>
      <div className="flex min-w-[250px] scale-[0.9] flex-col justify-center gap-2 rounded-md border border-[var(--border2)] bg-[var(--card2)] py-2 pl-3 pr-16 opacity-80">
        <div className="flex items-center justify-start text-xs text-[var(--text)]">
          <div className="relative">
            <svg width="20" height="20">
              <circle cx="10" cy="10" r="5" style={{ fill: 'var(--ok)' }} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-background">
              <Check className="size-2 text-white" />
            </div>
          </div>
          <div>{step1}</div>
        </div>
        <div
          className={`ml-5 h-1.5 w-[100%] overflow-hidden rounded-full bg-[var(--ok)]`}
        ></div>
      </div>
      <div className="absolute top-0 h-[40%] w-full [background-image:linear-gradient(to_bottom,var(--card)_20%,transparent_100%)]" />
      <div className="absolute bottom-0 h-[40%] w-full [background-image:linear-gradient(to_top,var(--card)_20%,transparent_100%)]" />
    </div>
  );
};
export default OnboardCard;
