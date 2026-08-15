import { DashboardApp } from "./components/dashboard-app";
import { requireAppSession } from "./lib/app-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireAppSession("/");
  return (
    <DashboardApp
      user={{ name: user.displayName, email: user.username }}
      signOutHref="/api/auth/logout"
    />
  );
}
