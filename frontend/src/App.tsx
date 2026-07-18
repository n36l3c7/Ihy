import { createBrowserRouter, Navigate, RouterProvider } from "react-router";

import { Layout } from "./components/Layout";
import { BackupPage } from "./features/admin/BackupPage";
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
import { FavoritesPage } from "./features/library/FavoritesPage";
import { FoldersPage } from "./features/library/FoldersPage";
import { GenresPage } from "./features/library/GenresPage";
import { HistoryPage } from "./features/library/HistoryPage";
import { StatsPage } from "./features/library/StatsPage";
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
          { path: "/folders", element: <FoldersPage /> },
          { path: "/bookmarks", element: <BookmarksPage /> },
          { path: "/stats", element: <StatsPage /> },
          { path: "/playlists/:playlistId", element: <PlaylistPage /> },
          {
            path: "/settings",
            element: <SettingsLayout />,
            children: [
              { index: true, element: <Navigate to="/settings/sources" replace /> },
              { path: "sources", element: <SourcesPage /> },
              { path: "library", element: <LibrarySettingsPage /> },
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
