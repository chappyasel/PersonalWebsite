"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "~/trpc/react";

import { setDadAccessCookie } from "../actions";

export function PasswordGate() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const verify = api.dad.verifyPassword.useMutation({
    onSuccess: async (data) => {
      if (data.valid) {
        await setDadAccessCookie();
        router.refresh();
      } else {
        setError("Incorrect password");
        setPassword("");
      }
    },
    onError: () => {
      setError("Something went wrong. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    verify.mutate({ password });
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm text-center"
      >
        <p className="mb-6 text-center text-xs tracking-widest text-muted-foreground">
          ✦
        </p>
        <h1 className="mb-2 text-3xl font-light italic tracking-wide text-foreground">
          Dad&apos;s Journal
        </h1>
        <p className="mb-8 text-sm italic text-muted-foreground">
          A father&apos;s record of a son&apos;s first twenty-five years.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="w-full rounded-none border-0 border-b border-muted-foreground/25 bg-transparent px-0 py-3 text-center font-serif text-foreground placeholder:text-muted-foreground focus:border-muted-foreground/50 focus:outline-none focus:ring-0"
          />

          {error && (
            <p className="text-sm text-amber-700/80 dark:text-amber-400/70">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={verify.isPending || !password}
            className="font-serif text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {verify.isPending ? "Checking..." : "Enter"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
