import { useEffect, useState } from "react";
import { api, JobStatus } from "@/lib/api";
import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Download, FileText } from "lucide-react";

export function ResultCard({ jobId }: { jobId: string }) {
  const [result, setResult] = useState<JobStatus | null>(null);

  useEffect(() => {
    api.getJobStatus(jobId).then(setResult).catch(console.error);
  }, [jobId]);

  if (!result) return null;

  const failed = result.status === "failed";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="bg-white border border-[#E5E4E0] rounded-2xl overflow-hidden"
    >
      {/* Banner */}
      <div className={`px-8 py-6 flex items-center gap-3 border-b border-[#F0EFEC] ${failed ? "bg-[#FFFBEB]" : "bg-[#F7F9F7]"}`}>
        {failed
          ? <AlertCircle className="w-5 h-5 text-[#B45309] shrink-0" />
          : <CheckCircle2 className="w-5 h-5 text-[#6B7B6E] shrink-0" />
        }
        <div>
          <p className="font-serif text-lg text-[#1C1C1E]">{failed ? "Processing failed" : "Processing complete"}</p>
          <p className="text-xs text-[#9CA3AF] font-mono mt-0.5">{jobId}</p>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-8">
        {failed ? (
          <div className="text-sm text-[#B45309] leading-relaxed">
            {result.error || "An unknown error occurred during processing. Please try again."}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: "Chunks processed", value: result.processed_chunks?.toLocaleString() ?? "—" },
                { label: "Operation", value: result.operation ?? "—", mono: false },
                { label: "Column", value: result.column ?? "—", mono: true },
              ].map((stat, i) => (
                <div key={i} className="bg-[#FAFAF8] rounded-xl p-4 border border-[#F0EFEC]">
                  <p className="text-xs text-[#9CA3AF] mb-1.5">{stat.label}</p>
                  <p className={`text-[#1C1C1E] font-medium ${stat.mono ? "font-mono text-sm" : "text-sm"}`}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Result value */}
            {result.result_value !== undefined && result.result_value !== null && (
              <div className="bg-[#FAFAF8] border border-[#E5E4E0] rounded-xl p-8 text-center">
                <p className="label-meta mb-3">Result</p>
                <p className="font-serif text-6xl text-[#1C1C1E]">
                  {typeof result.result_value === "number"
                    ? result.result_value.toLocaleString()
                    : result.result_value}
                </p>
              </div>
            )}

            {/* File result */}
            {result.result_file && (
              <div className="flex items-center gap-3 bg-[#F7F9F7] border border-[#C8CFC9] rounded-xl px-5 py-4">
                <FileText className="w-4 h-4 text-[#6B7B6E]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#1C1C1E] truncate">{result.result_file}</p>
                  <p className="text-xs text-[#9CA3AF]">Filtered dataset</p>
                </div>
                <a
                  href={api.getDownloadUrl(result.result_file)}
                  download
                  className="flex items-center gap-1.5 text-xs font-medium text-[#6B7B6E] hover:text-[#1C1C1E] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
