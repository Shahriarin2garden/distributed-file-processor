import { motion } from "framer-motion";
import { Server, Zap, Layers } from "lucide-react";

export function Hero() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="py-12 md:py-20 flex flex-col items-center text-center space-y-6"
    >
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm font-medium mb-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
        </span>
        System Online • Processing
      </div>
      
      <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground max-w-3xl">
        Distributed File <span className="text-primary">Processing</span>
      </h1>
      
      <p className="text-lg text-slate-600 max-w-2xl font-sans">
        Upload massive CSV or JSON files. We chunk them instantly and distribute the workload across our Ray cluster for real-time parallel computing.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 w-full max-w-4xl">
        {[
          { icon: <Zap className="w-6 h-6 text-accent" />, title: "Real-time Speed", desc: "Instant chunking & processing" },
          { icon: <Layers className="w-6 h-6 text-primary" />, title: "Distributed Ray", desc: "Horizontal worker scaling" },
          { icon: <Server className="w-6 h-6 text-blue-500" />, title: "Fault Tolerant", desc: "Automatic retries on failure" },
        ].map((feature, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 + i * 0.1, ease: "easeOut" }}
            className="flex flex-col items-center p-6 bg-white rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="p-3 bg-slate-50 rounded-xl mb-4">
              {feature.icon}
            </div>
            <h3 className="font-semibold text-foreground">{feature.title}</h3>
            <p className="text-sm text-slate-500 mt-1">{feature.desc}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
