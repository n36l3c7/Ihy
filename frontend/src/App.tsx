import { createBrowserRouter, Navigate, RouterProvider } from "react-router";

import { Layout } from "./components/Layout";
import { SourcesPage } from "./features/admin/SourcesPage";
import { LoginPage } from "./features/auth/LoginPage";
import { RequireAuth } from "./features/auth/RequireAuth";
import { SetupPage } from "./features/auth/SetupPage";
import { AlbumDetailPage } from "./features/library/AlbumDetailPage";
import { AlbumsPage } from "./features/library/AlbumsPage";
import { ArtistDetailPage } from "./features/library/ArtistDetailPage";
import { ArtistsPage } from "./features/library/ArtistsPage";
import { GenresPage } from "./features/library/GenresPage";
import { TracksPage } from "./features/library/TracksPage";

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
          { path: "/settings/sources", element: <SourcesPage /> },
          { path: "*", element: <Navigate to="/tracks" replace /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
