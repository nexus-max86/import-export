import { Logo } from '@/components/ui';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
      <Logo />
      {children}
    </main>
  );
}
