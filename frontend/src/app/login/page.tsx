'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import axios from 'axios';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

export default function LoginPage() {
    const { login } = useAuth();

    const [isSubmitting, setIsSubmitting] = useState(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');

        if (isSubmitting) return;
        setIsSubmitting(true);

        try {
            const response = await api.post('/auth/login', {
                email: email.trim().toLowerCase(),
                password
            });

            login(response.data.accessToken, response.data.user);
        } catch (err: unknown) {
            console.error('Authentication processing failure:', err);
            const fallbackMessage = 'Invalid email or password. Please try again.';
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.message || fallbackMessage);
            } else if (err instanceof Error) {
                setError(err.message || fallbackMessage);
            } else {
                setError(fallbackMessage);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center bg-zinc-950 p-4 font-sans">
            <div className="w-full max-w-md p-8 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl relative overflow-hidden">
                <div className="absolute -top-32 -left-32 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" aria-hidden="true" />

                <div className="relative z-10">
                    <header className="mb-8">
                        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-50 to-zinc-400 bg-clip-text text-transparent mb-2">
                            Welcome Back
                        </h1>
                        <p className="text-base text-zinc-400">Sign in to resume coaching your mock interview prep.</p>
                    </header>

                    {error && (
                        <div
                            role="alert"
                            className="p-3.5 mb-6 bg-red-950/40 border border-red-800/60 rounded-lg text-sm text-red-400 animate-fade-in"
                        >
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label
                                htmlFor="email-input"
                                className="block text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2"
                            >
                                Email Address
                            </label>
                            <input
                                id="email-input"
                                type="email"
                                required
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 rounded-lg bg-zinc-950 border border-zinc-800 text-base text-zinc-50 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
                                placeholder="you@example.com"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="password-input"
                                className="block text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2"
                            >
                                Password
                            </label>
                            <input
                                id="password-input"
                                type="password"
                                required
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 rounded-lg bg-zinc-950 border border-zinc-800 text-base text-zinc-50 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full py-3.5 px-4 rounded-lg bg-indigo-600 text-base font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors cursor-pointer disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Authenticating...' : 'Sign In'}
                        </button>
                    </form>

                    <footer className="mt-8 text-center text-sm text-zinc-400">
                        Don&#39;t have an account?{' '}
                        <Link href="/register" className="text-indigo-400 hover:underline focus:outline-none focus:text-indigo-300 font-semibold">
                            Sign Up
                        </Link>
                    </footer>
                </div>
            </div>
        </main>
    );
}