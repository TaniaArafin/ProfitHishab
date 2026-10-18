import type { useRouter } from 'next/navigation';

type Router = ReturnType<typeof useRouter>;

/**
 * After a write: go to `href`. Pages are never served from the client router cache (no `staleTimes`
 * in next.config), so it renders with the new data. Deliberately no router.refresh() as well:
 * push() + refresh() races, and the refresh can cancel the navigation (the save succeeds but the
 * form stays on screen).
 */
export function navigateFresh(router: Router, href: string): void {
  router.push(href);
}

/** After a write that stays on the page: re-render it from the server. */
export function refreshData(router: Router): void {
  router.refresh();
}
