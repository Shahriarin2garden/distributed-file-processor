"use client";

import { useState, useEffect } from "react";
import { JobUploadForm } from "@/components/JobUploadForm";
import { JobDashboard } from "@/components/JobDashboard";
import { ResultCard } from "@/components/ResultCard";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { GitBranch, ArrowLeft } from "lucide-react";

export default function Dashboard() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [estimatedChunks, setEstimatedChunks] = useState<number>(0);
  const [isComplete, setIsComplete] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const handleJobCreated = (id: string, chunks: number) => {
    setJobId(id);
    setEstimatedChunks(chunks);
    setIsComplete(false);
  };

  const handleJobComplete = () => setIsComplete(true);

  return (
    <main className="min-h-dvh bg-[#FAFAF8] text-[#1C1C1E] flex flex-col">
      {/* Nav */}
      <nav
        className={`sticky top-0 z-40 transition-all duration-300 ${
          scrolled
            ? "bg-white/95 backdrop-blur-sm border-b border-[#E5E4E0] shadow-[0_1px_0_rgba(0,0,0,0.04)]"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-[#6B7280] hover:text-[#1C1C1E] transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-sm bg-[#6B7B6E] flex items-center justify-center">
              <GitBranch className="w-3 h-3 text-white" strokeWidth={2} />
            </div>
            <span className="font-medium text-sm text-[#1C1C1E]">Workspace</span>
          </div>
        </div>
      </nav>

      {/* Page header */}
      <div className="max-w-5xl mx-auto px-6 pt-16 pb-12 w-full">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="label-meta mb-3">Workspace</p>
          <h1 className="display-heading text-4xl md:text-5xl text-[#1C1C1E] mb-4">
            Process your dataset
          </h1>
          <p className="text-[#6B7280] text-sm leading-relaxed max-w-md">
            Upload a CSV or JSON file, configure the operation, and let the distributed cluster handle the rest.
          </p>
        </motion.div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-5xl mx-auto px-6 pb-24 w-full">
        <AnimatePresence mode="wait">
          {!jobId && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <JobUploadForm onJobCreated={handleJobCreated} />
            </motion.div>
          )}

          {jobId && !isComplete && (
            <JobDashboard
              key="dashboard"
              jobId={jobId}
              estimatedChunks={estimatedChunks}
              onJobComplete={handleJobComplete}
            />
          )}

          {jobId && isComplete && (
            <ResultCard key="result" jobId={jobId} />
          )}
        </AnimatePresence>

        {jobId && (
          <div className="flex justify-center mt-12">
            <button
              onClick={() => { setJobId(null); setIsComplete(false); }}
              className="text-xs text-[#9CA3AF] hover:text-[#1C1C1E] transition-colors border-b border-transparent hover:border-[#C8CFC9] pb-0.5 cursor-pointer"
            >
              Start a new job
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
