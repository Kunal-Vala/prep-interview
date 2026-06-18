'use client';

import React, { useState } from 'react';

export default function TestApiPage() {
  const [status, setStatus] = useState<string>('Idle');
  const [response, setResponse] = useState<string>('');

  const handleTest = async () => {
    setStatus('Sending request to http://localhost:4000/auth/login...');
    setResponse('');

    try {
      const res = await fetch('http://localhost:4000/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'demo@prepinterview.dev',
          password: 'Demo@1234!',
        }),
      });

      setStatus(`Response Received (Status: ${res.status})`);
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (err: unknown) {
      setStatus('Request Failed');
      const message = err instanceof Error ? err.message : 'Unknown network error';
      setResponse(message);
    }
  };

  return (
    <div className="p-8 bg-zinc-950 text-zinc-100 min-h-screen font-sans">
      <h1 className="text-2xl font-bold mb-4">API Fetch Test Page</h1>
      <p className="text-sm text-zinc-400 mb-6">Tests a direct browser fetch POST to the NestJS backend.</p>

      <button
        onClick={handleTest}
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded font-semibold text-sm cursor-pointer"
      >
        Send Test POST
      </button>

      <div className="mt-8 space-y-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Status</h3>
          <p className="text-sm font-mono bg-zinc-900 p-3 rounded border border-zinc-800">{status}</p>
        </div>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Response / Error Payload</h3>
          <pre className="text-xs font-mono bg-zinc-900 p-3 rounded border border-zinc-800 overflow-x-auto">{response || 'None'}</pre>
        </div>
      </div>
    </div>
  );
}
