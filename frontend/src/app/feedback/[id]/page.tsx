'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import Link from 'next/link';

interface ImprovementItem {
    area: string;
    severity: 'low' | 'medium' | 'high';
    detail: string;
    actionableAdvice: string;
    exampleFromSession: string;
}

interface QuestionFeedbackItem {
    sequenceNumber: number;
    category: string;
    questionSummary: string;
    answerQuality: string;
    score: number;
    comment: string;
}

interface FeedbackReport {
    overallScore: string;
    technicalScore: string;
    communicationScore: string;
    pacingScore: string;
    codeQualityScore?: string;
    behavioralScore?: string;
    strengths: string[];
    improvements: ImprovementItem[];
    questionFeedback: QuestionFeedbackItem[];
    hiringRecommendation: string;
    hiringRationale: string;
    studyRecommendations: string[];
}

export default function FeedbackReportPage() {
    const { id: sessionId } = useParams() as { id: string };
    const { token, loading } = useAuth();
    const router = useRouter();

    const [report, setReport] = useState<FeedbackReport | null>(null);
    const [error, setError] = useState(false);

    // Auth Enforcer Guard
    useEffect(() => {
        if (!loading && !token) {
            router.push('/login');
        }
    }, [token, loading, router]);

    // Synchronize Analytics Data Payload
    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();

        async function fetchReport() {
            try {
                setError(false);
                const res = await api.get(`/interview/sessions/${sessionId}/feedback`, {
                    signal: controller.signal
                });
                if (isMounted) {
                    setReport(res.data);
                }
            } catch (err) {
                const isCanceled =
                    typeof err === 'object' &&
                    err !== null &&
                    'code' in err &&
                    (err as { code?: string }).code === 'ERR_CANCELED';

                if (isMounted && !isCanceled) {
                    console.error('Failed to load feedback report pipeline:', err);
                    setError(true);
                }
            }
        }

        if (token) {
            fetchReport();
        }

        return () => {
            isMounted = false;
            controller.abort();
        };
    }, [token, sessionId]);

    // Memoize Clamped Numerical Structural Score Transformations
    const radialMetrics = useMemo(() => {
        if (!report) return { scoreNum: 0, strokeOffset: 402 };
        const raw = parseFloat(report.overallScore) || 0;
        const clamped = Math.min(Math.max(raw, 0), 10);
        return {
            scoreNum: clamped,
            strokeOffset: 402 - (402 * clamped) / 10
        };
    }, [report]);

    // Memoize Structured Array Dimension Metric Bars Configuration
    const scoreDimensions = useMemo(() => {
        if (!report) return [];
        return [
            { id: 'tech', label: 'Technical Mastery', score: report.technicalScore },
            { id: 'comm', label: 'Communication Clarity', score: report.communicationScore },
            { id: 'pace', label: 'Answer Pacing', score: report.pacingScore },
            { id: 'code', label: 'Code Design Quality', score: report.codeQualityScore },
            { id: 'behav', label: 'Behavioral Quality (STAR)', score: report.behavioralScore },
        ].filter(dimension => Boolean(dimension.score));
    }, [report]);

    if (loading || (!report && !error)) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center" role="status" aria-live="polite">
                <span className="text-zinc-500 animate-pulse text-sm font-semibold tracking-wider">COMPILING EVALUATIONS METRICS...</span>
            </div>
        );
    }

    if (error || !report) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
                <main className="max-w-md text-center" role="alert">
                    <h2 className="text-2xl font-bold text-red-500 mb-2">Failed to Load Report</h2>
                    <p className="text-sm text-zinc-400 mb-6">The evaluation job is either still processing or failed during server-side compilation compilation updates.</p>
                    <Link href="/dashboard" className="px-5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-700">
                        Return to Dashboard
                    </Link>
                </main>
            </div>
        );
    }

    const recommendationText = (report.hiringRecommendation || 'PENDING').replace('_', ' ');
    const isRecommended = recommendationText.toLowerCase().includes('yes');

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-20 select-none">
            <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">
                <div className="flex items-center gap-3">
                    <Link href="/dashboard" className="text-xs font-semibold text-zinc-500 hover:text-zinc-300 focus:outline-none">
                        &larr; Back
                    </Link>
                    <span className="text-xs text-zinc-800" aria-hidden="true">|</span>
                    <h1 className="text-xs font-bold text-zinc-400 font-mono tracking-wider">ASSESSMENT LEDGER ANALYTICS</h1>
                </div>
                <Link href="/dashboard" className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors focus:outline-none">
                    Go to Dashboard
                </Link>
            </header>

            <main className="max-w-5xl w-full mx-auto px-6 mt-12 grid gap-8 md:grid-cols-3">
                {/* Radial Rating Card Section */}
                <section className="md:col-span-1 rounded-2xl bg-zinc-900 border border-zinc-800 p-6 flex flex-col items-center justify-center text-center shadow-sm">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-6">Overall Rating</h2>

                    <div className="relative w-36 h-36 flex items-center justify-center animate-fade-in" aria-label={`Overall score is ${radialMetrics.scoreNum.toFixed(1)} out of 10`}>
                        <svg className="w-full h-full transform -rotate-90" aria-hidden="true">
                            <circle cx="72" cy="72" r="64" stroke="rgba(39, 39, 42, 0.4)" strokeWidth="8" fill="transparent" />
                            <circle
                                cx="72" cy="72" r="64"
                                stroke="#4f46e5" strokeWidth="8" fill="transparent"
                                strokeDasharray="402"
                                strokeDashoffset={radialMetrics.strokeOffset}
                                strokeLinecap="round"
                                className="transition-all duration-500 ease-out"
                            />
                        </svg>
                        <span className="absolute text-4xl font-extrabold text-white font-mono">{radialMetrics.scoreNum.toFixed(1)}</span>
                    </div>

                    <div className="mt-8">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Recommendation</span>
                        <span className={`text-sm font-extrabold uppercase tracking-wide px-3 py-1.5 rounded-lg border ${isRecommended ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
                            }`}>
                            {recommendationText}
                        </span>
                    </div>
                </section>

                {/* Dimension Breakdown Card Section */}
                <section className="md:col-span-2 rounded-2xl bg-zinc-900 border border-zinc-800 p-6 flex flex-col justify-center gap-5 shadow-sm">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Score Dimension Breakdown</h2>

                    {scoreDimensions.map((bar) => {
                        const numericValue = parseFloat(bar.score || '0') || 0;
                        return (
                            <div key={bar.id} className="space-y-1.5">
                                <div className="flex justify-between text-xs font-semibold">
                                    <span className="text-zinc-300">{bar.label}</span>
                                    <span className="text-indigo-400 font-mono">{numericValue.toFixed(1)}/10.0</span>
                                </div>
                                <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden" aria-hidden="true">
                                    <div
                                        style={{ width: `${Math.min(Math.max(numericValue, 0), 10) * 10}%` }}
                                        className="h-full bg-indigo-600 rounded-full transition-all duration-500 ease-out"
                                    />
                                </div>
                            </div>
                        );
                    })}
                </section>

                {/* Hiring Rationale Section */}
                <section className="md:col-span-3 rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-sm">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">Executive Rationale</h2>
                    <p className="text-sm leading-relaxed text-zinc-300 whitespace-pre-line">{report.hiringRationale}</p>
                </section>

                {/* Core Strengths and Opportunities Matrix */}
                <div className="md:col-span-3 grid gap-6 md:grid-cols-2">
                    {/* Strengths Board */}
                    <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-sm">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" /> STRENGTHS ARCHIVE
                        </h2>
                        <ul className="space-y-3">
                            {report.strengths.map((str, index) => (
                                <li key={`str-${index}`} className="text-sm text-zinc-300 flex items-start gap-2.5 leading-relaxed">
                                    <span className="text-emerald-500 font-bold select-none" aria-hidden="true">&bull;</span>
                                    <span>{str}</span>
                                </li>
                            ))}
                        </ul>
                    </section>

                    {/* Opportunities Board */}
                    <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-sm">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden="true" /> REQUIRED OPPORTUNITY DELTAS
                        </h2>
                        <div className="space-y-5">
                            {report.improvements.map((imp, index) => (
                                <div key={`imp-${index}`} className="space-y-1.5 border-b border-zinc-850 pb-4 last:border-b-0 last:pb-0">
                                    <div className="flex items-center gap-2 justify-between">
                                        <span className="text-xs font-bold text-zinc-200">{imp.area}</span>
                                        <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase border tracking-wider ${imp.severity === 'high' ? 'bg-red-500/10 border-red-500/25 text-red-400' :
                                                imp.severity === 'medium' ? 'bg-amber-500/10 border-amber-500/25 text-amber-400' :
                                                    'bg-zinc-800 border-zinc-700 text-zinc-400'
                                            }`}>
                                            {imp.severity} severity
                                        </span>
                                    </div>
                                    <p className="text-xs text-zinc-400 leading-relaxed">{imp.detail}</p>
                                    <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-850 text-[11px] leading-relaxed">
                                        <strong className="text-indigo-400 block mb-1 tracking-wide font-semibold">Actionable Advice</strong>
                                        <span className="text-zinc-400">{imp.actionableAdvice}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                {/* Study Targets Chips Section */}
                <section className="md:col-span-3 rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-sm">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-4">Recommended Curated Study Focus Clusters</h2>
                    <div className="flex flex-wrap gap-2.5">
                        {report.studyRecommendations.map((study, index) => (
                            <span key={`study-${index}`} className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-850 text-xs font-medium text-zinc-300 tracking-wide">
                                {study}
                            </span>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
}