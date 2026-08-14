"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Upload,
  Cpu,
  GitBranch,
  ShieldCheck,
  BarChart3,
  Zap,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";

/* ─────────────────────────────────────────────────────────
   Navbar
───────────────────────────────────────────────────────── */
function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/95 backdrop-blur-sm border-b border-[#E5E4E0] shadow-[0_1px_0_rgba(0,0,0,0.04)]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-sm bg-[#6B7B6E] flex items-center justify-center">
            <GitBranch className="w-3.5 h-3.5 text-white" strokeWidth={2} />
          </div>
          <span className="font-sans font-medium text-[#1C1C1E] tracking-tight">
            Nexus
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-10 text-sm text-[#6B7280]">
          <a href="#how-it-works" className="hover:text-[#1C1C1E] transition-colors duration-150">
            How it works
          </a>
          <a href="#features" className="hover:text-[#1C1C1E] transition-colors duration-150">
            Features
          </a>
          <a href="#architecture" className="hover:text-[#1C1C1E] transition-colors duration-150">
            Architecture
          </a>
        </div>

        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#1C1C1E] text-white text-sm font-medium hover:bg-[#6B7B6E] transition-colors duration-200"
        >
          Open Workspace <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </nav>
  );
}

/* ─────────────────────────────────────────────────────────
   Hero — Animated Data Flow SVG
───────────────────────────────────────────────────────── */
function DataFlowSVG() {
  return (
    <svg
      viewBox="0 0 700 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full max-w-2xl mx-auto"
      aria-hidden="true"
    >
      {/* Connection lines */}
      <path
        d="M 140 160 C 230 160 270 80  350 80"
        stroke="#E5E4E0" strokeWidth="1.5" fill="none"
      />
      <path
        d="M 140 160 C 230 160 270 160 350 160"
        stroke="#E5E4E0" strokeWidth="1.5" fill="none"
      />
      <path
        d="M 140 160 C 230 160 270 240 350 240"
        stroke="#E5E4E0" strokeWidth="1.5" fill="none"
      />
      <path
        d="M 350 80  C 430 80  470 160 560 160"
        stroke="#E5E4E0" strokeWidth="1.5" fill="none"
      />
      <path
        d="M 350 160 C 430 160 470 160 560 160"
        stroke="#E5E4E0" strokeWidth="1.5" fill="none"
      />
      <path
        d="M 350 240 C 430 240 470 160 560 160"
        stroke="#E5E4E0" strokeWidth="1.5" fill="none"
      />

      {/* Animated flow — line 1 */}
      <circle r="3.5" fill="#6B7B6E" opacity="0.7">
        <animateMotion dur="3.2s" repeatCount="indefinite" begin="0s">
          <mpath href="#path1" />
        </animateMotion>
      </circle>
      <circle r="3.5" fill="#6B7B6E" opacity="0.5">
        <animateMotion dur="3.2s" repeatCount="indefinite" begin="1.1s">
          <mpath href="#path2" />
        </animateMotion>
      </circle>
      <circle r="3.5" fill="#6B7B6E" opacity="0.6">
        <animateMotion dur="3.2s" repeatCount="indefinite" begin="2.2s">
          <mpath href="#path3" />
        </animateMotion>
      </circle>
      <circle r="3.5" fill="#8A9A8D" opacity="0.6">
        <animateMotion dur="2.8s" repeatCount="indefinite" begin="0.5s">
          <mpath href="#path4" />
        </animateMotion>
      </circle>
      <circle r="3.5" fill="#8A9A8D" opacity="0.5">
        <animateMotion dur="2.8s" repeatCount="indefinite" begin="1.8s">
          <mpath href="#path5" />
        </animateMotion>
      </circle>
      <circle r="3.5" fill="#8A9A8D" opacity="0.7">
        <animateMotion dur="2.8s" repeatCount="indefinite" begin="0.9s">
          <mpath href="#path6" />
        </animateMotion>
      </circle>

      {/* Invisible paths for animateMotion */}
      <path id="path1" d="M 140 160 C 230 160 270 80 350 80 C 430 80 470 160 560 160" />
      <path id="path2" d="M 140 160 C 230 160 270 160 350 160 C 430 160 470 160 560 160" />
      <path id="path3" d="M 140 160 C 230 160 270 240 350 240 C 430 240 470 160 560 160" />
      <path id="path4" d="M 140 160 C 230 160 270 80 350 80 C 430 80 470 160 560 160" />
      <path id="path5" d="M 140 160 C 230 160 270 160 350 160 C 430 160 470 160 560 160" />
      <path id="path6" d="M 140 160 C 230 160 270 240 350 240 C 430 240 470 160 560 160" />

      {/* Client node */}
      <circle cx="140" cy="160" r="28" fill="#FFFFFF" stroke="#E5E4E0" strokeWidth="1.5" />
      <text x="140" y="155" textAnchor="middle" fontSize="9" fill="#6B7280" fontFamily="sans-serif">CLIENT</text>
      <text x="140" y="168" textAnchor="middle" fontSize="8" fill="#9CA3AF" fontFamily="sans-serif">source</text>

      {/* Worker nodes */}
      {[80, 160, 240].map((y, i) => (
        <g key={i}>
          <circle cx="350" cy={y} r="22" fill="#FAFAF8" stroke="#C8CFC9" strokeWidth="1.5">
            <animate attributeName="r" values="22;25;22" dur={`${2 + i * 0.4}s`} repeatCount="indefinite" />
          </circle>
          <text x="350" y={y + 4} textAnchor="middle" fontSize="8" fill="#6B7B6E" fontFamily="sans-serif" fontWeight="500">
            W{i + 1}
          </text>
        </g>
      ))}

      {/* Output node */}
      <circle cx="560" cy="160" r="28" fill="#6B7B6E" />
      <text x="560" y="155" textAnchor="middle" fontSize="9" fill="#fff" fontFamily="sans-serif">OUTPUT</text>
      <text x="560" y="168" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.7)" fontFamily="sans-serif">result</text>

      {/* Labels */}
      <text x="350" y="42" textAnchor="middle" fontSize="9" fill="#9CA3AF" fontFamily="sans-serif" letterSpacing="1">RAY WORKERS</text>
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────
   How it Works — Step Cards
───────────────────────────────────────────────────────── */
const steps = [
  {
    num: "01",
    title: "Upload",
    body: "Drop any CSV or JSON file into the workspace. The system maps your payload structure instantly.",
    icon: Upload,
    visual: (
      <svg viewBox="0 0 200 120" className="w-full" aria-hidden="true">
        <rect x="60" y="20" width="80" height="60" rx="6" fill="#F0EFEC" stroke="#E5E4E0" strokeWidth="1.5" />
        <line x1="75" y1="38" x2="125" y2="38" stroke="#D1D5DB" strokeWidth="1.5" />
        <line x1="75" y1="50" x2="115" y2="50" stroke="#D1D5DB" strokeWidth="1.5" />
        <line x1="75" y1="62" x2="120" y2="62" stroke="#D1D5DB" strokeWidth="1.5" />
        <g>
          <circle cx="100" cy="95" r="12" fill="#6B7B6E">
            <animate attributeName="cy" values="95;85;95" dur="1.8s" repeatCount="indefinite" />
          </circle>
          <path d="M95 90 L100 85 L105 90" stroke="white" strokeWidth="1.5" fill="none">
            <animate attributeName="d" values="M95 95 L100 90 L105 95;M95 88 L100 83 L105 88;M95 95 L100 90 L105 95" dur="1.8s" repeatCount="indefinite" />
          </path>
        </g>
      </svg>
    ),
  },
  {
    num: "02",
    title: "Distribute",
    body: "The Ray cluster fans your dataset into parallel workers. Each chunk is processed independently and concurrently.",
    icon: GitBranch,
    visual: (
      <svg viewBox="0 0 200 120" className="w-full" aria-hidden="true">
        <circle cx="50" cy="60" r="14" fill="#6B7B6E" />
        {[30, 60, 90].map((y, i) => (
          <g key={i}>
            <line x1="64" y1="60" x2="136" y2={y} stroke="#C8CFC9" strokeWidth="1.5">
              <animate attributeName="stroke-dasharray" values="0 80;80 0;80 0" dur="2s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
            </line>
            <circle cx="150" cy={y} r="10" fill="#F0EFEC" stroke="#C8CFC9" strokeWidth="1.5">
              <animate attributeName="fill" values="#F0EFEC;#FAFAF8;#F0EFEC" dur="2s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
            </circle>
          </g>
        ))}
      </svg>
    ),
  },
  {
    num: "03",
    title: "Merge",
    body: "Results are aggregated, validated, and returned as a single clean output — ready to download.",
    icon: BarChart3,
    visual: (
      <svg viewBox="0 0 200 120" className="w-full" aria-hidden="true">
        {[30, 60, 90].map((y, i) => (
          <g key={i}>
            <circle cx="50" cy={y} r="10" fill="#F0EFEC" stroke="#C8CFC9" strokeWidth="1.5" />
            <line x1="60" y1={y} x2="136" y2="60" stroke="#C8CFC9" strokeWidth="1.5">
              <animate attributeName="stroke-dasharray" values="80 0;0 80;80 0" dur="2s" begin={`${i * 0.25}s`} repeatCount="indefinite" />
            </line>
          </g>
        ))}
        <circle cx="150" cy="60" r="14" fill="#6B7B6E">
          <animate attributeName="r" values="14;17;14" dur="1.5s" repeatCount="indefinite" />
        </circle>
      </svg>
    ),
  },
];

function HowItWorksSection() {
  const [active, setActive] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="how-it-works" className="section-ma px-6 md:px-12 max-w-7xl mx-auto" ref={ref}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        className="mb-16"
      >
        <p className="label-meta mb-4">How it works</p>
        <h2 className="display-heading text-4xl md:text-5xl text-[#1C1C1E] max-w-lg">
          Three steps.<br />Infinite scale.
        </h2>
      </motion.div>

      <div className="grid md:grid-cols-2 gap-12 items-start">
        {/* Step selectors */}
        <div className="space-y-3">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.button
                key={i}
                onClick={() => setActive(i)}
                initial={{ opacity: 0, x: -20 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={`w-full text-left p-6 rounded-xl border transition-all duration-250 cursor-pointer ${
                  active === i
                    ? "bg-white border-[#C8CFC9] shadow-[0_4px_24px_rgba(0,0,0,0.06)] step-card-active"
                    : "bg-transparent border-[#E5E4E0] hover:border-[#C8CFC9] hover:bg-white/60"
                }`}
              >
                <div className="flex items-start gap-4">
                  <span className="label-meta mt-0.5">{step.num}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`w-4 h-4 transition-colors duration-200 ${active === i ? "text-[#6B7B6E]" : "text-[#9CA3AF]"}`} />
                      <h3 className="font-serif font-medium text-lg text-[#1C1C1E]">{step.title}</h3>
                    </div>
                    <AnimatePresence>
                      {active === i && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
                          className="text-sm text-[#6B7280] leading-relaxed overflow-hidden"
                        >
                          {step.body}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Visual panel */}
        <div className="bg-white rounded-2xl border border-[#E5E4E0] p-8 aspect-video flex items-center justify-center shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="w-full"
            >
              {steps[active].visual}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   Features Grid
───────────────────────────────────────────────────────── */
const features = [
  {
    icon: Zap,
    title: "Parallel Processing",
    body: "Ray distributes workloads across all available cores simultaneously. No bottlenecks, no waiting.",
  },
  {
    icon: ShieldCheck,
    title: "Fault Tolerant",
    body: "Worker failures are automatically detected and retried. Your data is never lost mid-process.",
  },
  {
    icon: BarChart3,
    title: "Live Monitoring",
    body: "Watch every chunk's progress in real time. Track throughput, latency, and cluster health live.",
  },
  {
    icon: Cpu,
    title: "Zero-Config Scaling",
    body: "The cluster auto-scales to meet demand. Small file or petabyte — the same API handles both.",
  },
];

function FeaturesSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="features" className="section-ma px-6 md:px-12 max-w-7xl mx-auto" ref={ref}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        className="mb-16"
      >
        <p className="label-meta mb-4">Core capabilities</p>
        <h2 className="display-heading text-4xl md:text-5xl text-[#1C1C1E] max-w-xl">
          Built for the work<br />that matters.
        </h2>
      </motion.div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {features.map((f, i) => {
          const Icon = f.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="group bg-white border border-[#E5E4E0] rounded-xl p-6 card-lift cursor-default"
            >
              <div className="w-9 h-9 rounded-lg bg-[#F0EFEC] flex items-center justify-center mb-5 group-hover:bg-[#6B7B6E]/10 transition-colors duration-200">
                <Icon className="w-4.5 h-4.5 text-[#6B7B6E]" strokeWidth={1.75} />
              </div>
              <h3 className="font-serif font-medium text-[#1C1C1E] mb-2">{f.title}</h3>
              <p className="text-sm text-[#6B7280] leading-relaxed">{f.body}</p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   Architecture Diagram
───────────────────────────────────────────────────────── */
function ArchitectureSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="architecture" className="section-ma px-6 md:px-12 max-w-7xl mx-auto" ref={ref}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        className="mb-16"
      >
        <p className="label-meta mb-4">System design</p>
        <h2 className="display-heading text-4xl md:text-5xl text-[#1C1C1E] max-w-lg">
          How the cluster<br />breathes together.
        </h2>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="bg-white border border-[#E5E4E0] rounded-2xl p-8 md:p-12 shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
      >
        {/* Architecture rows */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 md:gap-0">
          {/* Client */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-2xl bg-[#F0EFEC] border border-[#E5E4E0] flex items-center justify-center">
              <Upload className="w-6 h-6 text-[#6B7280]" />
            </div>
            <span className="label-meta">Client</span>
          </div>

          {/* Arrow */}
          <div className="hidden md:flex flex-col items-center gap-1 flex-1 mx-4 relative">
            <div className="h-px w-full bg-[#E5E4E0] relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 w-8 h-full bg-gradient-to-r from-[#6B7B6E] to-transparent"
                style={{ animation: "slideRight 2s linear infinite" }}>
              </div>
            </div>
            <span className="text-[10px] text-[#9CA3AF] mt-1">HTTP / REST</span>
            <style>{`@keyframes slideRight { from { left: -2rem; } to { left: 100%; } }`}</style>
          </div>

          {/* API Gateway */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-2xl bg-[#6B7B6E]/10 border border-[#C8CFC9] flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-[#6B7B6E]" />
            </div>
            <span className="label-meta">FastAPI</span>
          </div>

          {/* Arrow */}
          <div className="hidden md:flex flex-col items-center gap-1 flex-1 mx-4 relative">
            <div className="h-px w-full bg-[#E5E4E0] relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 w-8 h-full bg-gradient-to-r from-[#6B7B6E] to-transparent"
                style={{ animation: "slideRight 2s linear infinite", animationDelay: "0.5s" }}>
              </div>
            </div>
            <span className="text-[10px] text-[#9CA3AF] mt-1">Ray Submit</span>
          </div>

          {/* Ray Workers */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-10 h-10 rounded-xl bg-[#F0EFEC] border border-[#E5E4E0] flex items-center justify-center"
                  style={{ animationDelay: `${i * 0.3}s` }}
                >
                  <Cpu className="w-4 h-4 text-[#6B7B6E]" style={{ animation: `spin ${2 + i}s linear infinite` }} />
                </div>
              ))}
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
            <span className="label-meta">Ray Workers</span>
          </div>

          {/* Arrow */}
          <div className="hidden md:flex flex-col items-center gap-1 flex-1 mx-4 relative">
            <div className="h-px w-full bg-[#E5E4E0] relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 w-8 h-full bg-gradient-to-r from-[#6B7B6E] to-transparent"
                style={{ animation: "slideRight 2s linear infinite", animationDelay: "1s" }}>
              </div>
            </div>
            <span className="text-[10px] text-[#9CA3AF] mt-1">Aggregate</span>
          </div>

          {/* Result */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-2xl bg-[#6B7B6E] flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <span className="label-meta">Result</span>
          </div>
        </div>

        {/* Stat strip */}
        <div className="mt-12 pt-8 border-t border-[#F0EFEC] grid grid-cols-3 gap-4 text-center">
          {[
            { val: "∞", label: "Concurrent workers" },
            { val: "~0", label: "Single points of failure" },
            { val: "Auto", label: "Cluster scaling" },
          ].map((stat, i) => (
            <div key={i}>
              <div className="font-serif text-2xl text-[#1C1C1E] mb-1">{stat.val}</div>
              <div className="text-xs text-[#9CA3AF]">{stat.label}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   CTA Banner
───────────────────────────────────────────────────────── */
function CTASection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <section className="section-ma px-6 md:px-12 max-w-7xl mx-auto" ref={ref}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        className="bg-[#1C1C1E] rounded-2xl px-8 py-16 md:py-20 text-center"
      >
        <p className="text-[#6B7B6E] text-xs font-medium tracking-widest uppercase mb-5">
          Begin
        </p>
        <h2 className="font-serif font-light text-3xl md:text-5xl text-white mb-6 leading-tight">
          Process at scale.<br />Start in seconds.
        </h2>
        <p className="text-[#9CA3AF] text-sm max-w-md mx-auto mb-10 leading-relaxed">
          Upload a dataset. The cluster handles everything else — splitting, distributing, aggregating, and returning your results.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-white text-[#1C1C1E] font-medium text-sm hover:bg-[#6B7B6E] hover:text-white transition-colors duration-200"
        >
          Open Workspace <ArrowRight className="w-4 h-4" />
        </Link>
      </motion.div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   Footer
───────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="border-t border-[#E5E4E0] py-10 px-6 md:px-12">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-sm bg-[#6B7B6E] flex items-center justify-center">
            <GitBranch className="w-3 h-3 text-white" />
          </div>
          <span className="text-sm font-medium text-[#1C1C1E]">Nexus</span>
        </div>
        <p className="text-xs text-[#9CA3AF]">
          Distributed File Processing System — Built with Ray &amp; FastAPI
        </p>
      </div>
    </footer>
  );
}

/* ─────────────────────────────────────────────────────────
   Page Root
───────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div className="bg-[#FAFAF8] text-[#1C1C1E] min-h-dvh">
      <Navbar />

      {/* Hero */}
      <section className="min-h-dvh flex flex-col items-center justify-center px-6 md:px-12 pt-24 pb-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-4xl mx-auto"
        >
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="label-meta mb-7"
          >
            Distributed File Processing
          </motion.p>

          <h1 className="display-heading text-5xl md:text-7xl lg:text-8xl text-[#1C1C1E] mb-8">
            Process at scale.
            <br />
            <span className="text-[#6B7B6E]">Flow effortlessly.</span>
          </h1>

          <p className="text-base md:text-lg text-[#6B7280] max-w-xl mx-auto mb-12 leading-relaxed font-light">
            Upload your dataset. The distributed cluster splits, processes, and merges it—while you wait less than you expect.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#1C1C1E] text-white font-medium text-sm hover:bg-[#6B7B6E] transition-colors duration-200"
            >
              Start Processing <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#how-it-works"
              className="flex items-center gap-2 px-7 py-3.5 rounded-full border border-[#E5E4E0] text-[#6B7280] text-sm hover:border-[#C8CFC9] hover:text-[#1C1C1E] transition-colors duration-200"
            >
              See how it works
            </a>
          </div>
        </motion.div>

        {/* Animated SVG */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-3xl mx-auto bg-white border border-[#E5E4E0] rounded-2xl p-6 md:p-10 shadow-[0_4px_32px_rgba(0,0,0,0.05)]"
        >
          <DataFlowSVG />
          <p className="text-[10px] text-[#9CA3AF] tracking-widest uppercase text-center mt-4">
            Live cluster simulation
          </p>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.5 }}
          className="mt-12 flex flex-col items-center gap-1.5"
        >
          <span className="text-xs text-[#C4C4C4] tracking-widest uppercase">Explore</span>
          <ChevronDown className="w-4 h-4 text-[#C4C4C4]" style={{ animation: "bounce 2s infinite" }} />
        </motion.div>
      </section>

      {/* Thin divider */}
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="h-px bg-[#F0EFEC]" />
      </div>

      <HowItWorksSection />

      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="h-px bg-[#F0EFEC]" />
      </div>

      <FeaturesSection />

      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="h-px bg-[#F0EFEC]" />
      </div>

      <ArchitectureSection />

      <CTASection />

      <Footer />

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(6px); }
        }
      `}</style>
    </div>
  );
}
