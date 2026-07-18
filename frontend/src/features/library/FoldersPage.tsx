import { useQuery } from "@tanstack/react-query";
import { Folder, HardDrive } from "lucide-react";
import { useSearchParams } from "react-router";

import { browseLibrary } from "../../api/wave3";
import { PageSpinner } from "../../components/Spinner";
import { TrackList } from "./TrackList";

export function FoldersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sourceId = searchParams.get("source");
  const path = searchParams.get("path") ?? "";

  const query = useQuery({
    queryKey: ["browse", sourceId, path],
    queryFn: () =>
      browseLibrary(sourceId ? { source_id: Number(sourceId), path } : {}),
  });

  const navigateTo = (nextSource: string | null, nextPath: string) => {
    const params: Record<string, string> = {};
    if (nextSource) params.source = nextSource;
    if (nextPath) params.path = nextPath;
    setSearchParams(params);
  };

  const segments = path ? path.split("/").filter(Boolean) : [];

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Folders</h1>

      <nav className="mb-6 flex flex-wrap items-center gap-1 text-sm text-zinc-400">
        <button
          type="button"
          onClick={() => navigateTo(null, "")}
          className="hover:text-zinc-100 hover:underline"
        >
          Sources
        </button>
        {sourceId && (
          <>
            <span>/</span>
            <button
              type="button"
              onClick={() => navigateTo(sourceId, "")}
              className="hover:text-zinc-100 hover:underline"
            >
              {query.data?.sources.find((s) => String(s.id) === sourceId)?.name ?? "source"}
            </button>
          </>
        )}
        {segments.map((segment, index) => (
          <span key={index} className="flex items-center gap-1">
            <span>/</span>
            <button
              type="button"
              onClick={() => navigateTo(sourceId, segments.slice(0, index + 1).join("/"))}
              className="hover:text-zinc-100 hover:underline"
            >
              {segment}
            </button>
          </span>
        ))}
      </nav>

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <p className="py-12 text-center text-red-400">Failed to browse.</p>
      ) : !sourceId ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {query.data.sources.map((source) => (
            <button
              key={source.id}
              type="button"
              onClick={() => navigateTo(String(source.id), "")}
              className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-left transition-colors hover:border-emerald-600/50 hover:bg-zinc-900"
            >
              <HardDrive className="h-5 w-5 shrink-0 text-emerald-500" />
              <span className="truncate text-sm font-medium text-zinc-100">{source.name}</span>
            </button>
          ))}
          {query.data.sources.length === 0 && (
            <p className="col-span-full text-zinc-500">No sources configured.</p>
          )}
        </div>
      ) : (
        <>
          {query.data.folders.length > 0 && (
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {query.data.folders.map((folder) => (
                <button
                  key={folder}
                  type="button"
                  onClick={() =>
                    navigateTo(sourceId, path ? `${path}/${folder}` : folder)
                  }
                  className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-left transition-colors hover:border-emerald-600/50 hover:bg-zinc-900"
                >
                  <Folder className="h-5 w-5 shrink-0 text-zinc-500" />
                  <span className="truncate text-sm text-zinc-100">{folder}</span>
                </button>
              ))}
            </div>
          )}
          {query.data.tracks.length > 0 ? (
            <TrackList tracks={query.data.tracks} showNumbers />
          ) : (
            query.data.folders.length === 0 && (
              <p className="py-8 text-center text-zinc-500">This folder is empty.</p>
            )
          )}
        </>
      )}
    </div>
  );
}
