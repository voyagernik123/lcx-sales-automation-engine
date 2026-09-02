/**
 * THE ROUTER'S ERROR VIEW is the product's, not the framework's: an unknown URL is a named state with a way home, and a
 * thrown route error goes through the same ErrorNotice every panel uses.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { RouteError } from '../RouteError';

describe('RouteError', () => {
  it('names a wrong URL and offers the way home', () => {
    const router = createMemoryRouter([{ path: '*', element: <RouteError notFound /> }], { initialEntries: ['/nowhere'] });
    render(<RouterProvider router={router} />);
    expect(screen.getByTestId('route-not-found')).toBeTruthy();
    expect(screen.getByText('This page does not exist')).toBeTruthy();
    expect(screen.getByRole('link', { name: /back to the deck/i }).getAttribute('href')).toBe('/');
  });

  it('a thrown route error renders the product ErrorNotice, not the developer page', async () => {
    const router = createMemoryRouter([{ path: '/', element: <Boom />, errorElement: <RouteError /> }], { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    expect(await screen.findByTestId('route-error')).toBeTruthy();
    expect(screen.queryByText(/Hey developer/)).toBeNull();
  });
});

function Boom(): never { throw new Error('a thrown route error'); }
