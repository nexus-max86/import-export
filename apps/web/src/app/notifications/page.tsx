'use client';

import { ClientHeader, NotificationCenter } from '@/components/notifications';

export default function NotificationsPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-10">
      <ClientHeader />
      <h1 className="font-display text-2xl font-bold">Notifications</h1>
      <NotificationCenter />
    </main>
  );
}
