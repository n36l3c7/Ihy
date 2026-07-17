import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router";

import { getMe } from "../../api/auth";
import { FullScreenSpinner } from "../../components/Spinner";
import { useAuthStore } from "../../stores/authStore";

export function RequireAuth() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const [failed, setFailed] = useState(false);
  const hasSession = Boolean(accessToken || refreshToken);

  useEffect(() => {
    if (!hasSession || user) return;
    getMe()
      .then(setUser)
      .catch(() => setFailed(true));
  }, [hasSession, user, setUser]);

  if (!hasSession || failed) return <Navigate to="/login" replace />;
  if (!user) return <FullScreenSpinner />;
  return <Outlet />;
}
