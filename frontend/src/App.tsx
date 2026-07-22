import { createBrowserRouter, Navigate, RouterProvider, useRouteError } from "react-router";

import { Layout } from "./components/Layout";
import { BackupPage } from "./features/admin/BackupPage";
import { HealthPage } from "./features/admin/HealthPage";
import { LibrarySettingsPage } from "./features/admin/LibrarySettingsPage";
import { SettingsLayout } from "./features/admin/SettingsLayout";
import { SourcesPage } from "./features/admin/SourcesPage";
import { SpotdlActivityPage } from "./features/admin/spotdl/SpotdlActivityPage";
import { SpotdlLayout } from "./features/admin/spotdl/SpotdlLayout";
import { SpotdlSettingsPage } from "./features/admin/spotdl/SpotdlSettingsPage";
import { WatchesPage } from "./features/admin/spotdl/WatchesPage";
import { UserCreatePage } from "./features/admin/users/UserCreatePage";
import { UserEditPage } from "./features/admin/users/UserEditPage";
import { UsersLayout } from "./features/admin/users/UsersLayout";
import { UsersListPage } from "./features/admin/users/UsersListPage";
import { LoginPage } from "./features/auth/LoginPage";
import { RequireAuth } from "./features/auth/RequireAuth";
import { SetupPage } from "./features/auth/SetupPage";
import { AlbumDetailPage } from "./features/library/AlbumDetailPage";
import { AlbumsPage } from "./features/library/AlbumsPage";
import { ArtistDetailPage } from "./features/library/ArtistDetailPage";
import { ArtistsPage } from "./features/library/ArtistsPage";
import { BookmarksPage } from "./features/library/BookmarksPage";
import { ExplorePage } from "./features/library/ExplorePage";
import { FavoritesPage } from "./features/library/FavoritesPage";
import { FoldersPage } from "./features/library/FoldersPage";
import { DownloadsPage } from "./features/library/DownloadsPage";
import { HomePage } from "./features/library/HomePage";
import { GenresPage } from "./features/library/GenresPage";
import { HistoryPage } from "./features/library/HistoryPage";
import { LibraryHubPage } from "./features/library/LibraryHubPage";
import { NeverPlayedPage } from "./features/library/NeverPlayedPage";
import { RadioPage } from "./features/library/RadioPage";
import { WrappedPage } from "./features/library/WrappedPage";
import { StatsPage } from "./features/library/StatsPage";
import { TracksPage } from "./features/library/TracksPage";
import { PlaylistPage } from "./features/playlists/PlaylistPage";
import { SmartPlaylistPage } from "./features/playlists/SmartPlaylistPage";
import { ScrobblingPage } from "./features/settings/ScrobblingPage";

function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : "Unexpected error";
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-zinc-950 text-zinc-100">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="max-w-lg text-center text-sm text-zinc-400">{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
      >
        Reload
      </button>
    </div>
  );
}

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage />, errorElement: <RouteError /> },
  { path: "/setup", element: <SetupPage />, errorElement: <RouteError /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <Navigate to="/home" replace /> },
          { path: "/home", element: <HomePage /> },
          { path: "/explore", element: <ExplorePage /> },
          { path: "/library", element: <LibraryHubPage /> },
          { path: "/tracks", element: <TracksPage /> },
          { path: "/artists", element: <ArtistsPage /> },
          { path: "/artists/:artistId", element: <ArtistDetailPage /> },
          { path: "/albums", element: <AlbumsPage /> },
          { path: "/albums/:albumId", element: <AlbumDetailPage /> },
          { path: "/genres", element: <GenresPage /> },
          { path: "/favorites", element: <FavoritesPage /> },
          { path: "/history", element: <HistoryPage /> },
          { path: "/folders", element: <FoldersPage /> },
          { path: "/bookmarks", element: <BookmarksPage /> },
          { path: "/downloads", element: <DownloadsPage /> },
          { path: "/never-played", element: <NeverPlayedPage /> },
          { path: "/radio", element: <RadioPage /> },
          { path: "/wrapped", element: <WrappedPage /> },
          { path: "/stats", element: <StatsPage /> },
          { path: "/playlists/:playlistId", element: <PlaylistPage /> },
          { path: "/smart/:smartId", element: <SmartPlaylistPage /> },
          { path: "/scrobbling", element: <ScrobblingPage /> },
          {
            path: "/settings",
            element: <SettingsLayout />,
            children: [
              { index: true, element: <Navigate to="/settings/sources" replace /> },
              { path: "sources", element: <SourcesPage /> },
              { path: "library", element: <LibrarySettingsPage /> },
              { path: "health", element: <HealthPage /> },
              {
                path: "users",
                element: <UsersLayout />,
                children: [
                  { index: true, element: <UsersListPage /> },
                  { path: "new", element: <UserCreatePage /> },
                  { path: ":userId", element: <UserEditPage /> },
                ],
              },
              {
                path: "spotdl",
                element: <SpotdlLayout />,
                children: [
                  { index: true, element: <WatchesPage /> },
                  { path: "options", element: <SpotdlSettingsPage /> },
                  { path: "activity", element: <SpotdlActivityPage /> },
                ],
              },
              { path: "backup", element: <BackupPage /> },
            ],
          },
          { path: "*", element: <Navigate to="/tracks" replace /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
