import { createBrowserRouter, Navigate, RouterProvider } from "react-router";

import { Layout } from "./components/Layout";
import { DownloadsPage } from "./features/admin/DownloadsPage";
import { LibrarySettingsPage } from "./features/admin/LibrarySettingsPage";
import { SettingsLayout } from "./features/admin/SettingsLayout";
import { SourcesPage } from "./features/admin/SourcesPage";
import { UsersPage } from "./features/admin/UsersPage";
import { LoginPage } from "./features/auth/LoginPage";
import { RequireAuth } from "./features/auth/RequireAuth";
import { SetupPage } from "./features/auth/SetupPage";
import { AlbumDetailPage } from "./features/library/AlbumDetailPage";
import { AlbumsPage } from "./features/library/AlbumsPage";
import { ArtistDetailPage } from "./features/library/ArtistDetailPage";
import { ArtistsPage } from "./features/library/ArtistsPage";
import { FavoritesPage } from "./features/library/FavoritesPage";
import { GenresPage } from "./features/library/GenresPage";
import { HistoryPage } from "./features/library/HistoryPage";
import { TracksPage } from "./features/library/TracksPage";
import { PlaylistPage } from "./features/playlists/PlaylistPage";

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/setup", element: <SetupPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <Navigate to="/tracks" replace /> },
          { path: "/tracks", element: <TracksPage /> },
          { path: "/artists", element: <ArtistsPage /> },
          { path: "/artists/:artistId", element: <ArtistDetailPage /> },
          { path: "/albums", element: <AlbumsPage /> },
          { path: "/albums/:albumId", element: <AlbumDetailPage /> },
          { path: "/genres", element: <GenresPage /> },
          { path: "/favorites", element: <FavoritesPage /> },
          { path: "/history", element: <HistoryPage /> },
          { path: "/playlists/:playlistId", element: <PlaylistPage /> },
          {
            path: "/settings",
            element: <SettingsLayout />,
            children: [
              { index: true, element: <Navigate to="/settings/sources" replace /> },
              { path: "sources", element: <SourcesPage /> },
              { path: "library", element: <LibrarySettingsPage /> },
              { path: "users", element: <UsersPage /> },
              { path: "downloads", element: <DownloadsPage /> },
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
