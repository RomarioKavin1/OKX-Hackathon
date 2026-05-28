import { Nav } from "@/components/Nav";
import type { ReactNode } from "react";

/**
 * (app) group layout — server component.
 * Renders the top Nav and wraps children in a centered max-width container.
 * The `(app)` folder name adds NO URL segment.
 */
export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </div>
    </>
  );
}
