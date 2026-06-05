'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import Link from 'next/link';

interface Session {
  id: string;
  targetRole: string;
  difficulty: number;
  mode: string;
  createdAt: string;
  feedbackReport?: {
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    overallScore?: string;
  };
  _count: {
    questions: number;
  };
}

export default function DashboardPage() {
  const { user, token, loading, logout } = useAuth();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Primary Component States
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // Modal Configuration States
  const [showModal, setShowModal] = useState(false);
  const [targetRole, setTargetRole] = useState('Node.js Backend Engineer');
  const [difficulty, setDifficulty] = useState<number>(3);
  const [mode, setMode] = useState<'TEXT' | 'VOICE'>('VOICE');

  // Route Authentication Protection Guard
  useEffect(() => {
    if (!loading && !token) {
      router.push('/login');
    }
  }, [token, loading, router]);

  // Network Fetch Synchronization with AbortController Integration
  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();
    
    async function loadDashboardData() {
      try {
        setFetchError('');
        const res = await api.get('/interview/sessions', { signal: controller.signal });
        setSessions(res.data);
      } catch (err: unknown) {
        if (axios.isCancel(err)) {
          console.log('Rogue concurrent fetch operation successfully aborted.');
          return;
        }
        setFetchError('Failed to synchronize your interview profile history. Please try again.');
        console.error('Dashboard synchronization failure:', err);
      } finally {
        setSessionsLoading(false);
      }
    }

    loadDashboardData();

    return () => {
      controller.abort();
    };
  }, [token]);

  const handleStartSession = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isPending) return;

    startTransition(async () => {
      try {
        const res = await api.post('/interview/sessions', {
          targetRole: targetRole.trim(),
          difficulty,
          mode,
        });
        
        setShowModal(false);
        router.push(`/interview/${res.data.id}`);
      } catch (err: unknown) {
        console.error('Session orchestration launch failure:', err);
        setFetchError('Failed to spin up interview execution thread.');
      }
    });
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center" role="status" aria-live="polite">
        <span className="text-zinc-500 animate-pulse text-sm font-semibold tracking-wider">LOADING SECURE SHELL...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-lg text-white" aria-hidden="true">A</div>
          <span className="font-extrabold tracking-tight bg-gradient-to-r from-zinc-50 to-zinc-400 bg-clip-text text-transparent">Antigravity Prep</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400 font-medium">Hello, <strong className="text-zinc-200">{user.displayName}</strong></span>
          <button onClick={logout} className="text-sm font-semibold px-3.5 py-2 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-350 transition-colors cursor-pointer">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10">
        {fetchError && (
          <div role="alert" className="p-4 mb-6 bg-red-950/40 border border-red-900/50 rounded-xl text-sm text-red-400">
            {fetchError}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
          <div>
            <h1 className="text-4xl font-extrabold text-zinc-50 mb-2">Practice Dashboard</h1>
            <p className="text-base text-zinc-300">Challenge yourself with dynamic technical and situational interviewer response streams.</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-base shadow-lg shadow-indigo-600/10 transition-all cursor-pointer text-center whitespace-nowrap"
          >
            Start New Mock Interview
          </button>
        </div>

        <section aria-labelledby="history-heading">
          <h2 id="history-heading" className="text-xl font-bold text-zinc-200 mb-6">Recent Sessions</h2>
          
          {sessionsLoading ? (
            <div className="py-20 text-center text-zinc-500 text-base tracking-wide animate-pulse" role="status">
              Synchronizing history ledger...
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-20 rounded-2xl bg-zinc-900/40 border border-zinc-850 border-dashed text-center">
              <p className="text-base text-zinc-400 mb-4">You haven&#39;t initiated any practice assessment slots yet.</p>
              <button onClick={() => setShowModal(true)} className="text-sm font-bold text-indigo-400 hover:underline cursor-pointer">Launch your first attempt</button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {sessions.map((session) => (
                <article key={session.id} className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-sm text-zinc-400 font-mono">ID: {session.id.slice(-8).toUpperCase()}</span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                        session.feedbackReport?.status === 'COMPLETED' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                        session.feedbackReport?.status === 'PROCESSING' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400 animate-pulse' :
                        'bg-zinc-950 border-zinc-800 text-zinc-400'
                      }`}>
                        {session.feedbackReport?.status === 'COMPLETED' ? `Score: ${session.feedbackReport.overallScore || 'N/A'}` : (session.feedbackReport?.status || 'PENDING')}
                      </span>
                    </div>
                    <h3 className="text-xl font-extrabold text-zinc-100 mb-1">{session.targetRole}</h3>
                    <div className="flex gap-3 text-sm text-zinc-400 mb-6">
                      <span>Diff: <strong className="text-zinc-200">{session.difficulty}/5</strong></span>
                      <span>•</span>
                      <span>Questions: <strong className="text-zinc-200">{session._count.questions}</strong></span>
                      <span>•</span>
                      <span className="capitalize">{session.mode.toLowerCase()} mode</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-zinc-950 pt-4">
                    <span className="text-sm text-zinc-400">{new Date(session.createdAt).toLocaleDateString()}</span>
                    {session.feedbackReport?.status === 'COMPLETED' ? (
                      <Link href={`/feedback/${session.id}`} className="text-sm font-bold text-indigo-400 hover:text-indigo-300 focus:outline-none">View Report &rarr;</Link>
                    ) : (
                      <Link href={`/interview/${session.id}`} className="text-sm font-bold text-zinc-300 hover:text-zinc-100 focus:outline-none">Enter Room &rarr;</Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Setup Dialogue Modal Overlay Configuration */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 shadow-3xl" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 p-6 relative overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="absolute -top-32 -left-32 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" aria-hidden="true" />
            <div className="relative z-10">
              <h3 className="text-2xl font-bold text-zinc-50 mb-1">Session Setup</h3>
              <p className="text-sm text-zinc-400 mb-6">Configure the AI interviewer targets.</p>

              <form onSubmit={handleStartSession} className="space-y-5">
                <div>
                  <label htmlFor="role-input" className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Target Role</label>
                  <input
                    id="role-input"
                    type="text" required
                    value={targetRole} onChange={(e) => setTargetRole(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-zinc-950 border border-zinc-800 text-base text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="difficulty-input" className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Difficulty (1-5)</label>
                  <input
                    id="difficulty-input"
                    type="number" min="1" max="5" required
                    value={difficulty} onChange={(e) => setDifficulty(parseInt(e.target.value, 10) || 3)}
                    className="w-full px-4 py-3 rounded-lg bg-zinc-950 border border-zinc-800 text-base text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <span className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Communication Mode</span>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button" onClick={() => setMode('VOICE')}
                      className={`py-3 px-4 rounded-lg text-sm font-bold border transition-all cursor-pointer ${mode === 'VOICE' ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400' : 'bg-zinc-950 border-zinc-850 text-zinc-500'}`}
                    >
                      Voice STT/TTS
                    </button>
                    <button
                      type="button" onClick={() => setMode('TEXT')}
                      className={`py-3 px-4 rounded-lg text-sm font-bold border transition-all cursor-pointer ${mode === 'TEXT' ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400' : 'bg-zinc-950 border-zinc-850 text-zinc-500'}`}
                    >
                      Text Chat
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 justify-end pt-4">
                  <button
                    type="button" onClick={() => setShowModal(false)}
                    className="py-3 px-5 rounded-lg bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 text-sm font-bold text-zinc-400 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit" disabled={isPending}
                    className="py-3 px-6 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white disabled:bg-zinc-800 disabled:text-zinc-600 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isPending ? 'Starting...' : 'Launch Session'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}