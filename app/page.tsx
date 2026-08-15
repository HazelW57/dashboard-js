import { DashboardApp } from "./components/dashboard-app";
import { requireAppSession } from "./lib/app-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireAppSession("/");
  return (
    <DashboardApp
      user={{ name: user.displayName, username: user.username, role: user.role }}
      signOutHref="/api/auth/logout"
    />
  );
}
