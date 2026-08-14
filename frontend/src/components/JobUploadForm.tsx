import { useState } from "react";
import { UploadCloud, Database, Settings2, SlidersHorizontal } from "lucide-react";
import { api, Operation } from "@/lib/api";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface JobUploadFormProps {
  onJobCreated: (jobId: string, estimatedChunks: number) => void;
}

export function JobUploadForm({ onJobCreated }: JobUploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [operation, setOperation] = useState<Operation>("sum");
  const [column, setColumn] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [chunkSize, setChunkSize] = useState("50000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !column) {
      setError("Please select a file and specify a target column.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.uploadFile(file, operation, column, filterValue, parseInt(chunkSize, 10));
      onJobCreated(res.job_id, res.estimated_chunks);
    } catch (err: any) {
      setError(err.message || "Connection failed. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Drop zone */}
      <div className="relative group cursor-pointer">
        <input
          type="file"
          accept=".csv,.json"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          aria-label="Upload file"
        />
        <div
          className={cn(
            "border border-dashed rounded-xl px-8 py-14 flex flex-col items-center justify-center text-center transition-all duration-200",
            file
              ? "border-[#6B7B6E] bg-[#6B7B6E]/5"
              : "border-[#D1D5DB] bg-white group-hover:border-[#A3B8A6] group-hover:bg-[#F7F9F7]"
          )}
        >
          <div
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-colors duration-200",
              file ? "bg-[#6B7B6E]/15" : "bg-[#F0EFEC] group-hover:bg-[#6B7B6E]/10"
            )}
          >
            <UploadCloud
              className={cn("w-5 h-5 transition-colors duration-200", file ? "text-[#6B7B6E]" : "text-[#9CA3AF] group-hover:text-[#6B7B6E]")}
            />
          </div>

          {file ? (
            <>
              <p className="font-medium text-[#1C1C1E] text-sm mb-1">{file.name}</p>
              <p className="text-xs text-[#9CA3AF]">{(file.size / 1024 / 1024).toFixed(2)} MB · Click to change</p>
            </>
          ) : (
            <>
              <p className="font-medium text-[#1C1C1E] text-sm mb-1">Drop your file here</p>
              <p className="text-xs text-[#9CA3AF]">CSV or JSON · up to 500 MB</p>
            </>
          )}
        </div>
      </div>

      {/* Config panel */}
      <div className="bg-white border border-[#E5E4E0] rounded-xl divide-y divide-[#F0EFEC]">

        {/* Operation */}
        <div className="flex items-center gap-4 px-5 py-4">
          <Settings2 className="w-4 h-4 text-[#9CA3AF] shrink-0" />
          <div className="flex-1">
            <label className="block text-xs text-[#9CA3AF] mb-1">Operation</label>
            <select
              value={operation}
              onChange={(e) => setOperation(e.target.value as Operation)}
              className="w-full bg-transparent text-sm text-[#1C1C1E] focus:outline-none cursor-pointer"
            >
              <option value="sum">Sum</option>
              <option value="mean">Mean / Average</option>
              <option value="filter">Filter (count matches)</option>
            </select>
          </div>
        </div>

        {/* Column */}
        <div className="flex items-center gap-4 px-5 py-4">
          <Database className="w-4 h-4 text-[#9CA3AF] shrink-0" />
          <div className="flex-1">
            <label htmlFor="column" className="block text-xs text-[#9CA3AF] mb-1">Target column</label>
            <input
              id="column"
              type="text"
              value={column}
              onChange={(e) => setColumn(e.target.value)}
              placeholder="e.g. amount, price, status"
              className="w-full bg-transparent text-sm text-[#1C1C1E] placeholder:text-[#C4C4C4] focus:outline-none"
            />
          </div>
        </div>

        {/* Filter value (conditional) */}
        {operation === "filter" && (
          <div className="flex items-center gap-4 px-5 py-4">
            <SlidersHorizontal className="w-4 h-4 text-[#9CA3AF] shrink-0" />
            <div className="flex-1">
              <label htmlFor="filterValue" className="block text-xs text-[#9CA3AF] mb-1">Match value</label>
              <input
                id="filterValue"
                type="text"
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                placeholder="Exact value to count"
                className="w-full bg-transparent text-sm text-[#1C1C1E] placeholder:text-[#C4C4C4] focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Chunk size */}
        <div className="flex items-center gap-4 px-5 py-4">
          <SlidersHorizontal className="w-4 h-4 text-[#9CA3AF] shrink-0" />
          <div className="flex-1">
            <div className="flex justify-between mb-2">
              <label className="text-xs text-[#9CA3AF]">Chunk size</label>
              <span className="text-xs font-mono text-[#6B7B6E]">{Number(chunkSize).toLocaleString()} rows</span>
            </div>
            <input
              type="range"
              min="10000"
              max="100000"
              step="10000"
              value={chunkSize}
              onChange={(e) => setChunkSize(e.target.value)}
              className="w-full h-1 appearance-none rounded-full cursor-pointer"
              style={{ accentColor: "#6B7B6E" }}
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-4 py-3"
        >
          {error}
        </motion.p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !file || !column}
        className="w-full py-3.5 rounded-full bg-[#1C1C1E] text-white text-sm font-medium hover:bg-[#6B7B6E] disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
      >
        {loading ? "Preparing job…" : "Start Processing"}
      </button>
    </form>
  );
}
