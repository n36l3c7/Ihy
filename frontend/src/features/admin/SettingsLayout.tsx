import { Navigate, NavLink, Outlet } from "react-router";

import { useAuthStore } from "../../stores/authStore";

export function SettingsLayout() {
  const user = useAuthStore((state) => state.user);
  if (user?.role !== "admin") return <Navigate to="/tracks" replace />;

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? "border-emerald-500 text-zinc-100"
        : "border-transparent text-zinc-400 hover:text-zinc-100"
    }`;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Settings</h1>
      <nav className="mb-6 flex gap-2 border-b border-zinc-800">
        <NavLink to="/settings/sources" className={tabClass}>
          Sources
        </NavLink>
        {/* Future tabs: Library (metadata separators), Users */}
      </nav>
      <Outlet />
    </div>
  );
}
