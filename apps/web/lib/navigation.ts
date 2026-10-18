import type { useRouter } from 'next/navigation';

type Router = ReturnType<typeof useRouter>;

/**
 * After a write: drop the client router cache, then go to `href`, so it renders with the new data.
 * In this order on purpose. `push()` then `refresh()` races: the refresh can re-render the page
 * being left and cancel the navigation (the save succeeds but the form stays on screen).
 */
export function navigateFresh(router: Router, href: string): void {
  router.refresh();
  router.push(href);
}
