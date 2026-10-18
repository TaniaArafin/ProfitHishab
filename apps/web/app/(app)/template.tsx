import type { ReactNode } from 'react';

/** Unlike the layout, a template remounts on every navigation, so each page animates in (see `.page-enter`). */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
