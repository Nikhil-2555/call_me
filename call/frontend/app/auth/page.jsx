"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FcGoogle } from "react-icons/fc";
import { FaGithub } from "react-icons/fa";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Spline from '../../components/spline';

const TABS = ["Sign In", "Sign Up"];

export default function AuthPage() {
  const [active, setActive] = useState("Sign In");

  const FormFields = () => (
    <motion.form
      key={active}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
      action="/"   /* ← submits to “/” */
    >
      {active === "Sign Up" && (
        <Input placeholder="Full Name" required className="bg-white/5 border-white/10 text-white placeholder:text-white/40" />
      )}
      <Input type="email" placeholder="Email" required className="bg-white/5 border-white/10 text-white placeholder:text-white/40" />
      <Input type="password" placeholder="Password" required className="bg-white/5 border-white/10 text-white placeholder:text-white/40" />
      {active === "Sign Up" && (
        <Input type="password" placeholder="Confirm Password" required className="bg-white/5 border-white/10 text-white placeholder:text-white/40" />
      )}
      <Button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white">
        {active}
      </Button>
    </motion.form>
  );

  return (
    <main className="min-h-screen grid md:grid-cols-2 bg-neutral-950 text-white">
      {/* left panel */}
      <aside className="hidden md:flex items-center justify-center relative overflow-hidden">
        <motion.div
          className="absolute w-[200%] h-[200%] bg-gradient-to-br from-orange-500 via-blue-500 to-transparent rounded-full blur-3xl opacity-20"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
        />
        <Spline/>
      </aside>

      {/* right panel */}
      <section className="flex items-center justify-center p-6">
        <motion.div
          className="w-full max-w-sm space-y-6 p-8 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          {/* tabs */}
          <div className="flex bg-black/20 rounded-full p-1">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setActive(t)}
                className={`flex-1 py-2 text-sm rounded-full transition ${active === t ? "bg-orange-500 text-white" : "text-white/60 hover:text-white"}`}
              >
                {t}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <FormFields />
          </AnimatePresence>

          <div className="flex items-center gap-3 text-xs text-white/40">
            <hr className="flex-1 border-white/10" />
            <span>or</span>
            <hr className="flex-1 border-white/10" />
          </div>

          {/* providers */}
          <div className="space-y-3">
            {[FcGoogle, FaGithub].map((Icon, idx) => (
              <Link href="/" key={idx} className="block">
                <Button
                  variant="outline"
                  className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10"
                >
                  <Icon className="mr-2 text-lg" />
                  Continue with {idx === 0 ? "Google" : "GitHub"}
                </Button>
              </Link>
            ))}
          </div>
        </motion.div>
      </section>
    </main>
  );
}