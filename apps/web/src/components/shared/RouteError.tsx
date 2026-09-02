import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { EmptyState } from './EmptyState';
import { ErrorNotice } from './ErrorNotice';

/**
 * THE ROUTER'S OWN ERROR VIEW (THE PRODUCTION, P5 — found in passing). Without an `errorElement` on the shell route, an
 * unknown URL rendered react-router's developer message ("Unexpected Application Error! 404 Not Found — Hey developer 👋")
 * on a black page, inside a product that says elsewhere that every state is named. A wrong URL is a NAMED state: this page
 * does not exist, here is the way home. Any other route error goes through the same ErrorNotice every panel uses, so the
 * classification (no connection vs something broke) is the product's, not the framework's.
 */
export function RouteError({ notFound = false }: { notFound?: boolean } = {}) {
  const error = notFound ? null : useRouteError();
  if (notFound || (isRouteErrorResponse(error) && error.status === 404)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8" data-testid="route-not-found">
        <EmptyState
          title="This page does not exist"
          description="The address has no desk behind it. The workspaces are one press away — ⌘K — or start from the deck."
          action={<Link to="/" className="text-body font-medium text-accent-text underline-offset-2 hover:underline">Back to the deck</Link>}
        />
      </div>
    );
  }
  return (
    <div className="p-8" data-testid="route-error">
      <ErrorNotice error={error} onRetry={() => { window.location.reload(); }} />
    </div>
  );
}
