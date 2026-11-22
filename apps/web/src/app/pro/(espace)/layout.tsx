import { SidebarLayout } from '@/components/nav';
import { ProSidebar } from '@/components/pro-nav';

/** Pages de l'espace professionnel (hors choix de l'activité) : barre latérale sur ordinateur. */
export default function ProSpaceLayout({ children }: { children: React.ReactNode }) {
  return <SidebarLayout sidebar={<ProSidebar />}>{children}</SidebarLayout>;
}
