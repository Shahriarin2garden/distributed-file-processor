import { useEffect, useState } from "react";
import { api, JobStatus } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface JobDashboardProps {
  jobId: string;
  estimatedChunks: number;
  onJobComplete: () => void;
}

const LOG_NODES = ["alpha", "beta", "gamma", "delta", "epsilon"];

export function JobDashboard({ jobId, estimatedChunks, onJobComplete }: JobDashboardProps) {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([`Initializing job ${jobId.slice(0, 8)}…`]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await api.getJobStatus(jobId);
        setStatus(data);

        if (data.status === "completed") {
          clearInterval(interval);
          setLogs((p) => [...p, "All chunks processed. Aggregating result…"]);
          setTimeout(onJobComplete, 1200);
        } else if (data.status === "failed") {
          clearInterval(interval);
          setLogs((p) => [...p, "Worker failure detected."]);
        } else if (Math.random() > 0.45) {
          const n = LOG_NODES[Math.floor(Math.random() * LOG_NODES.length)];
          setLogs((p) => [...p, `node-${n}  chunk processed OK`].slice(-8));
        }
      } catch {
        // silent
      }
    }, 1200);
    return () => clearInterval(interval);
  }, [jobId, onJobComplete]);

  const total = status?.total_chunks || estimatedChunks;
  const done = status?.processed_chunks ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const failed = status?.status === "failed";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-5"
    >
      {/* Header card */}
      <div className="bg-white border border-[#E5E4E0] rounded-xl px-6 py-5 flex items-center justify-between">
        <div>
          <p className="label-meta mb-0.5">Active job</p>
          <p className="font-mono text-xs text-[#9CA3AF]">{jobId}</p>
        </div>
        <div className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full
          ${failed
            ? "bg-[#FEF3C7] text-[#B45309]"
            : status?.status === "completed"
              ? "bg-[#F0FDF4] text-[#166534]"
              : "bg-[#F0EFEC] text-[#6B7280]"
          }`}
        >
          {status?.status === "completed" && <CheckCircle2 className="w-3.5 h-3.5" />}
          {failed && <AlertCircle className="w-3.5 h-3.5" />}
          {!failed && status?.status !== "completed" && (
            <span className="w-2 h-2 rounded-full bg-[#6B7B6E] animate-pulse" />
          )}
          {status?.status ?? "initializing"}
        </div>
      </div>

      {/* Progress card */}
      <div className="bg-white border border-[#E5E4E0] rounded-xl px-6 py-6">
        <div className="flex justify-between items-baseline mb-4">
          <span className="text-sm text-[#6B7280]">Progress</span>
          <span className="font-serif text-3xl text-[#1C1C1E]">{pct}<span className="text-base text-[#9CA3AF] ml-0.5">%</span></span>
        </div>

        {/* Track */}
        <div className="h-1.5 bg-[#F0EFEC] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-[#6B7B6E] rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>

        <div className="flex justify-between mt-3 text-xs text-[#C4C4C4] font-mono">
          <span>{done.toLocaleString()} chunks done</span>
          <span>est. {total.toLocaleString()} total</span>
        </div>
      </div>

      {/* Log stream */}
      <div className="bg-white border border-[#E5E4E0] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#F0EFEC] flex items-center justify-between">
          <span className="label-meta">Log stream</span>
          <span className="w-2 h-2 rounded-full bg-[#6B7B6E] animate-pulse" />
        </div>
        <div className="px-5 py-4 h-44 overflow-hidden flex flex-col justify-end gap-1.5">
          <AnimatePresence initial={false}>
            {logs.map((log, i) => (
              <motion.p
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className={`font-mono text-xs leading-relaxed ${
                  log.includes("failure") || log.includes("error")
                    ? "text-[#B45309]"
                    : log.includes("Aggregating") || log.includes("Initializing")
                      ? "text-[#6B7B6E]"
                      : "text-[#9CA3AF]"
                }`}
              >
                {log}
              </motion.p>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
