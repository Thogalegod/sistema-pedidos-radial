'use client';

import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Home from './page';

const mocks = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  pushMock: vi.fn(),
  signOutMock: vi.fn(),
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  fromMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

type AuthCallback = (event: string, session: unknown) => void;

let authCallback: AuthCallback | null = null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.pushMock,
    replace: mocks.replaceMock,
  }),
}));

vi.mock('../lib/sorting', () => ({
  sortOrders: (orders: unknown[]) => orders,
}));

vi.mock('../components/OrderCard', () => ({
  OrderCard: () => <div>order-card</div>,
}));

vi.mock('../components/OrderDrawer', () => ({
  OrderDrawer: () => null,
}));

vi.mock('../components/NewOrderDrawer', () => ({
  NewOrderDrawer: () => null,
}));

vi.mock('react-hot-toast', () => ({
  Toaster: () => null,
  toast: {
    error: mocks.toastErrorMock,
    success: vi.fn(),
    loading: vi.fn(),
  },
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSessionMock,
      onAuthStateChange: mocks.onAuthStateChangeMock,
      signOut: mocks.signOutMock,
    },
    from: mocks.fromMock,
  },
}));

function createPendingSessionPromise() {
  let resolve: ((value: { data: { session: unknown } }) => void) | null = null;
  const promise = new Promise<{ data: { session: unknown } }>((res) => {
    resolve = res;
  });

  return {
    promise,
    resolve: (value: { data: { session: unknown } }) => resolve?.(value),
  };
}

describe('Home auth flow', () => {
  beforeEach(() => {
    mocks.replaceMock.mockReset();
    mocks.pushMock.mockReset();
    mocks.signOutMock.mockReset();
    mocks.getSessionMock.mockReset();
    mocks.onAuthStateChangeMock.mockReset();
    mocks.fromMock.mockReset();
    mocks.toastErrorMock.mockReset();
    authCallback = null;

    mocks.onAuthStateChangeMock.mockImplementation((callback: AuthCallback) => {
      authCallback = callback;
      return {
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      };
    });

    mocks.fromMock.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    });
  });

  it('waits for the initial session resolution before redirecting on a null auth event', () => {
    const pendingSession = createPendingSessionPromise();
    mocks.getSessionMock.mockReturnValue(pendingSession.promise);

    render(<Home />);

    expect(authCallback).not.toBeNull();

    authCallback?.('SIGNED_OUT', null);

    expect(mocks.replaceMock).not.toHaveBeenCalled();
  });

  it('redirects to /login after the initial session check resolves without a session', async () => {
    mocks.getSessionMock.mockResolvedValue({
      data: {
        session: null,
      },
    });

    render(<Home />);

    await waitFor(() => {
      expect(mocks.replaceMock).toHaveBeenCalledWith('/login');
    });
  });
});
