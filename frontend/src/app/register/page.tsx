'use client';

import React, { useState } from 'react';
import Link from 'next/link';

import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

interface RegistrationErrorPayload {
  message?: string;
}

export default function RegisterPage() {
  const { login } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const validateForm = (): boolean => {
    if (displayName.trim().length < 2) {
      setError('Display name must be at least 2 characters long.');
      return false;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long and include robust variations.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) return;
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const response = await api.post('/auth/register', {
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        password
      });

      login(response.data.accessToken, response.data.user);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const serverError = err as import('axios').AxiosError<RegistrationErrorPayload>;
        setError(serverError.response?.data?.message || 'Registration transaction rejected.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('A severe application failure occurred.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 p-4 font-sans">
      <div className="w-full max-w-md p-8 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" aria-hidden="true" />
        
        <div className="relative z-10">
          <header className="mb-8">
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-50 to-zinc-400 bg-clip-text text-transparent mb-2">
              Create Account
            </h1>
            <p className="text-sm text-zinc-400">Sign up to access structured AI mock interviews.</p>
          </header>
          
          {error && (
            <div role="alert" className="p-3 mb-6 bg-red-950/40 border border-red-800/60 rounded-lg text-xs text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name-field" className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Display Name
              </label>
              <input
                id="name-field"
                type="text" 
                required
                autoComplete="name"
                value={displayName} 
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-50 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="Alex Mercer"
              />
            </div>

            <div>
              <label htmlFor="email-field" className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <input
                id="email-field"
                type="email" 
                required
                autoComplete="email"
                value={email} 
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-50 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password-field" className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                id="password-field"
                type="password" 
                required
                autoComplete="new-password"
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-50 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit" 
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <footer className="mt-8 text-center text-xs text-zinc-500">
            Already have an account?{' '}
            <Link href="/login" className="text-emerald-400 hover:underline focus:outline-none focus:text-emerald-300">
              Sign In
            </Link>
          </footer>
        </div>
      </div>
    </main>
  );
}