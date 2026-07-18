import { AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Outlet } from "react-router";

import { getDownloadStatus } from "../../../api/downloads";
import { TabNav } from "../../../components/TabNav";

export function SpotdlLayout() {
  const status = useQuery({ queryKey: ["download-status"], queryFn: getDownloadStatus });

  return (
    <div>
      {status.data?.available === false && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-600/40 bg-amber-600/10 p-4 text-sm text-amber-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          spotdl is not installed on the server: watches can be configured but downloads will
          not run. The Docker image ships with spotdl included.
        </div>
      )}
      <TabNav
        tabs={[
          { to: "/settings/spotdl", label: "Watches", end: true },
          { to: "/settings/spotdl/options", label: "Settings" },
          { to: "/settings/spotdl/activity", label: "Activity" },
        ]}
      />
      <Outlet />
    </div>
  );
}
