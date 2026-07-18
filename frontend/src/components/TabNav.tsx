import { NavLink } from "react-router";

interface Tab {
  to: string;
  label: string;
  end?: boolean;
}

export function TabNav({ tabs }: { tabs: Tab[] }) {
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? "border-emerald-500 text-zinc-100"
        : "border-transparent text-zinc-400 hover:text-zinc-100"
    }`;

  return (
    <nav className="mb-6 flex gap-2 border-b border-zinc-800">
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className={tabClass}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
