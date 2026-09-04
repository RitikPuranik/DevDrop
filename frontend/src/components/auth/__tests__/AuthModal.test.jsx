import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import AuthModal from '../AuthModal';
import { authAPI } from '../../../api/auth';

vi.mock('../../../api/auth', () => ({
  authAPI: {
    login: vi.fn(),
    register: vi.fn(),
    forgotPassword: vi.fn(),
    googleAuth: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const renderModal = (props = {}) =>
  render(
    <MemoryRouter>
      <AuthModal isOpen onClose={vi.fn()} {...props} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('AuthModal — login', () => {
  it('renders the login form by default when open', () => {
    renderModal();
    expect(screen.getAllByPlaceholderText('Email or Phone').length).toBeGreaterThan(0);
    expect(screen.getAllByPlaceholderText('Password').length).toBeGreaterThan(0);
  });

  it('does not render anything when isOpen is false', () => {
    const { container } = render(
      <MemoryRouter>
        <AuthModal isOpen={false} onClose={vi.fn()} />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('submits login credentials and stores the token on success', async () => {
    authAPI.login.mockResolvedValue({
      data: { data: { token: 'tok_123', user: { role: 'user', name: 'Jane' } } },
    });
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.change(screen.getAllByPlaceholderText('Email or Phone')[0], { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getAllByPlaceholderText('Password')[0], { target: { value: 'password123' } });
    fireEvent.submit(screen.getAllByPlaceholderText('Email or Phone')[0].closest('form'));

    await waitFor(() => expect(authAPI.login).toHaveBeenCalledWith({ emailOrPhone: 'jane@example.com', password: 'password123' }));
    await waitFor(() => expect(localStorage.getItem('token')).toBe('tok_123'));
    expect(toast.success).toHaveBeenCalledWith('Login successful!');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an error toast and does not store a token when login fails', async () => {
    authAPI.login.mockRejectedValue({ response: { data: { message: 'Invalid credentials' } } });
    renderModal();

    fireEvent.change(screen.getAllByPlaceholderText('Email or Phone')[0], { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getAllByPlaceholderText('Password')[0], { target: { value: 'wrong' } });
    fireEvent.submit(screen.getAllByPlaceholderText('Email or Phone')[0].closest('form'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid credentials'));
    expect(localStorage.getItem('token')).toBeNull();
  });
});

describe('AuthModal — signup', () => {
  it('switches to the signup form', () => {
    renderModal();
    const toggle = screen.getAllByText(/sign up/i)[0];
    fireEvent.click(toggle);
    expect(screen.getAllByPlaceholderText('Full Name').length).toBeGreaterThan(0);
  });

  it('submits signup data and shows a verify-email prompt on success (does not auto-close)', async () => {
    authAPI.register.mockResolvedValue({
      data: { data: { token: 'tok_456', user: { role: 'user', name: 'New User' } } },
    });
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getAllByText(/sign up/i)[0]);

    fireEvent.change(screen.getAllByPlaceholderText('Full Name')[0], { target: { value: 'New User' } });
    fireEvent.change(screen.getAllByPlaceholderText('Email')[0], { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getAllByPlaceholderText('Password')[0], { target: { value: 'password123' } });
    fireEvent.submit(screen.getAllByPlaceholderText('Full Name')[0].closest('form'));

    await waitFor(() => expect(authAPI.register).toHaveBeenCalled());
    expect(authAPI.register.mock.calls[0][0]).toMatchObject({ name: 'New User', email: 'new@example.com', password: 'password123' });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Account created! Please verify your email.'));
    // Signup does not auto-close the modal or navigate away — it flips back to the login view.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('surfaces a validation error from the server (e.g. duplicate email)', async () => {
    authAPI.register.mockRejectedValue({ response: { data: { message: 'Email already exists' } } });
    renderModal();
    fireEvent.click(screen.getAllByText(/sign up/i)[0]);

    fireEvent.change(screen.getAllByPlaceholderText('Full Name')[0], { target: { value: 'Dup User' } });
    fireEvent.change(screen.getAllByPlaceholderText('Email')[0], { target: { value: 'dup@example.com' } });
    fireEvent.change(screen.getAllByPlaceholderText('Password')[0], { target: { value: 'password123' } });
    fireEvent.submit(screen.getAllByPlaceholderText('Full Name')[0].closest('form'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Email already exists'));
  });
});

describe('AuthModal — forgot password', () => {
  it('rejects an empty email client-side without calling the API', async () => {
    renderModal();
    fireEvent.click(screen.getAllByText(/forgot your password/i)[0]);
    const forms = screen.getAllByPlaceholderText('Email');
    fireEvent.submit(forms[0].closest('form'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Please enter your email address'));
    expect(authAPI.forgotPassword).not.toHaveBeenCalled();
  });

  it('rejects a malformed email client-side without calling the API', async () => {
    renderModal();
    fireEvent.click(screen.getAllByText(/forgot your password/i)[0]);
    const input = screen.getAllByPlaceholderText('Email')[0];
    fireEvent.change(input, { target: { value: 'not-an-email' } });
    fireEvent.submit(input.closest('form'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Please enter a valid email address'));
    expect(authAPI.forgotPassword).not.toHaveBeenCalled();
  });

  it('sends a valid email and returns to the login view on success', async () => {
    authAPI.forgotPassword.mockResolvedValue({ data: { success: true } });
    renderModal();
    fireEvent.click(screen.getAllByText(/forgot your password/i)[0]);
    const input = screen.getAllByPlaceholderText('Email')[0];
    fireEvent.change(input, { target: { value: 'reset@example.com' } });
    fireEvent.submit(input.closest('form'));

    await waitFor(() => expect(authAPI.forgotPassword).toHaveBeenCalledWith('reset@example.com'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('If this email exists, a reset link has been sent'));
  });
});
