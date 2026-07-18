import { Outlet } from "react-router";

import { TabNav } from "../../../components/TabNav";

export function UsersLayout() {
  return (
    <div>
      <TabNav
        tabs={[
          { to: "/settings/users", label: "All users", end: true },
          { to: "/settings/users/new", label: "New user" },
        ]}
      />
      <Outlet />
    </div>
  );
}
