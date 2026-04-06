"use client";

import { YoutubeLogo } from "@phosphor-icons/react/dist/ssr";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "~/trpc/react";

import { setYoutubeAccessCookie } from "../actions";

export function YouTubePasswordGate() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const verify = api.youtube.verifyPassword.useMutation({
    onSuccess: async (data) => {
      if (data.valid) {
        await setYoutubeAccessCookie();
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
        <YoutubeLogo
          className="mx-auto mb-6 h-10 w-10 text-red-600"
          weight="fill"
        />
        <h1 className="mb-2 font-rounded text-2xl font-semibold text-foreground/90">
          YouTube Watch History
        </h1>
        <p className="mb-8 text-sm text-muted-foreground/70">
          This content is password-protected.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="w-full rounded-lg border border-neutral-200 bg-transparent px-4 py-3 text-center text-foreground placeholder:text-muted-foreground/50 focus:border-neutral-400 focus:outline-none focus:ring-0 dark:border-neutral-700 dark:focus:border-neutral-500"
          />

          {error && (
            <p className="text-sm text-red-600/80 dark:text-red-400/70">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={verify.isPending || !password}
            className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground/60 transition-colors hover:text-foreground disabled:opacity-50"
          >
            {verify.isPending ? "Checking..." : "Enter"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
