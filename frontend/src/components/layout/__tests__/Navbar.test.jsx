import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from '../Navbar';

const renderNavbar = () => render(<MemoryRouter><Navbar /></MemoryRouter>);

const openMenu = () => {
  // The menu items only render after the hamburger toggle is opened.
  const toggle = document.querySelector('nav > button');
  fireEvent.click(toggle);
};

beforeEach(() => {
  localStorage.clear();
});

describe('Navbar auth state', () => {
  it('shows a Login control when logged out', () => {
    renderNavbar();
    openMenu();
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  it('shows Logout instead of Login once a token is present on mount', () => {
    localStorage.setItem('token', 'tok_123');
    localStorage.setItem('user', JSON.stringify({ role: 'user', name: 'Jane' }));
    renderNavbar();
    openMenu();
    expect(screen.queryByText('Login')).not.toBeInTheDocument();
  });

  it('does not show an Admin link for a regular user', () => {
    localStorage.setItem('token', 'tok_123');
    localStorage.setItem('user', JSON.stringify({ role: 'user' }));
    renderNavbar();
    openMenu();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('shows an Admin link when the stored user has role "admin"', () => {
    localStorage.setItem('token', 'tok_admin');
    localStorage.setItem('user', JSON.stringify({ role: 'admin' }));
    renderNavbar();
    openMenu();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('reacts to a same-tab "auth-changed" event (e.g. fired right after login)', () => {
    renderNavbar();
    openMenu();
    expect(screen.getByText('Login')).toBeInTheDocument();

    act(() => {
      localStorage.setItem('token', 'tok_456');
      localStorage.setItem('user', JSON.stringify({ role: 'user' }));
      window.dispatchEvent(new Event('auth-changed'));
    });

    expect(screen.queryByText('Login')).not.toBeInTheDocument();
  });

  it('treats malformed stored user JSON as non-admin rather than crashing', () => {
    localStorage.setItem('token', 'tok_789');
    localStorage.setItem('user', '{not-valid-json');
    renderNavbar();
    openMenu();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('clears the session and shows Login again after logout', () => {
    localStorage.setItem('token', 'tok_123');
    localStorage.setItem('user', JSON.stringify({ role: 'user' }));
    renderNavbar();
    openMenu();
    const logoutButtons = screen.getAllByText(/logout/i);
    fireEvent.click(logoutButtons[0]);

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    openMenu(); // logout also closes the slide-out menu, so reopen it to check the state
    expect(screen.getByText('Login')).toBeInTheDocument();
  });
});
