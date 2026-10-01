import { motion } from "framer-motion";
import { ArrowLeft, Sun } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Brandmark } from "@/components/WorkspaceNav";

export default function NotFound() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="relative min-h-screen flex flex-col bg-background overflow-hidden"
    >
      <div className="sun-grid pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex h-16 w-full max-w-5xl items-center px-5">
        <Brandmark />
      </div>
      <div className="relative flex-1 flex flex-col items-center justify-center px-5 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
          <Sun className="size-6" />
        </span>
        <p className="eyebrow mt-6 text-muted-foreground">Off the map</p>
        <h1 className="display mt-2 text-5xl font-semibold">404</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          This page wandered off the roof. Your saved scenarios and drafts are safe —
          head back to the workspace.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild className="rounded-full">
            <Link to="/simulator">
              <ArrowLeft className="size-4" /> Back to simulator
            </Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/">Landing page</Link>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
