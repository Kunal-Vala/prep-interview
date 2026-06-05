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

interface Question {
    id: string;
    sessionId: string;
    sequenceNumber: number;
    category: string;
    questionText: string;
    userAnswer?: string | null;
    aiFollowUp?: string | null;
    llmAnnotation?: string | null;
    askedAt: string;
    answeredAt?: string | null;
    answerDuration?: number | null;
}

interface QuestionFeedbackItem {
    sequenceNumber: number;
    category: string;
    questionSummary: string;
    answerQuality: string;
    score: number;
    comment: string;
    suggestionsForImprovement?: string;
    idealResponseOutline?: string;
}

interface FeedbackReport {
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
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
    questions?: Question[];
}

export default function FeedbackReportPage() {
    const { id: sessionId } = useParams() as { id: string };
    const { token, loading } = useAuth();
    const router = useRouter();

    const [report, setReport] = useState<FeedbackReport | null>(null);
    const [error, setError] = useState(false);
    const [expandedQuestionSeq, setExpandedQuestionSeq] = useState<number | null>(1);

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

    // Map of sequenceNumber -> QuestionFeedbackItem for O(1) lookup
    const questionFeedbackMap = useMemo(() => {
        const map = new Map<number, QuestionFeedbackItem>();
        if (report?.questionFeedback) {
            for (const item of report.questionFeedback) {
                map.set(item.sequenceNumber, item);
            }
        }
        return map;
    }, [report]);

    if (loading || (!report && !error)) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center" role="status" aria-live="polite">
                <span className="text-zinc-400 animate-pulse text-base font-bold tracking-wider">COMPILING EVALUATIONS METRICS...</span>
            </div>
        );
    }

    if (error || !report) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
                <main className="max-w-md text-center" role="alert">
                    <h2 className="text-2xl font-bold text-red-500 mb-2">Failed to Load Report</h2>
                    <p className="text-base text-zinc-400 mb-6">The evaluation job is either still processing or failed during server-side compilation compilation updates.</p>
                    <Link href="/dashboard" className="px-6 py-3 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-bold text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-700">
                        Return to Dashboard
                    </Link>
                </main>
            </div>
        );
    }

    if (report.status !== 'COMPLETED') {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
                <main className="max-w-md text-center" role="alert">
                    {report.status === 'FAILED' ? (
                        <>
                            <h2 className="text-2xl font-bold text-red-500 mb-2">Grading Failed</h2>
                            <p className="text-base text-zinc-400 mb-6">Something went wrong while grading your mock interview session. Please try again or contact support.</p>
                        </>
                    ) : (
                        <>
                            <h2 className="text-2xl font-bold text-indigo-400 mb-2 animate-pulse">Grading In Progress</h2>
                            <p className="text-base text-zinc-400 mb-6">Your mock interview is being graded by our AI assessor. This usually takes 5-15 seconds. Please refresh the page shortly.</p>
                            <button
                                onClick={() => window.location.reload()}
                                className="px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white focus:outline-none mr-3 cursor-pointer"
                            >
                                Refresh Page
                            </button>
                        </>
                    )}
                    <Link href="/dashboard" className="px-6 py-3 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-bold text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-700">
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
                    <Link href="/dashboard" className="text-base font-bold text-zinc-400 hover:text-zinc-200 focus:outline-none">
                        &larr; Back
                    </Link>
                    <span className="text-base text-zinc-850" aria-hidden="true">|</span>
                    <h1 className="text-base font-extrabold text-zinc-200 font-mono tracking-wider">ASSESSMENT LEDGER ANALYTICS</h1>
                </div>
                <Link href="/dashboard" className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-base font-bold text-white transition-colors focus:outline-none">
                    Go to Dashboard
                </Link>
            </header>

            <main className="max-w-5xl w-full mx-auto px-6 mt-12 grid gap-8 md:grid-cols-3">
                {/* Radial Rating Card Section */}
                <section className="md:col-span-1 rounded-2xl bg-zinc-900 border border-zinc-800 p-6 flex flex-col items-center justify-center text-center shadow-sm">
                    <h2 className="text-base font-bold uppercase tracking-wider text-zinc-400 mb-6">Overall Rating</h2>

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
                        <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest block mb-2.5">Recommendation</span>
                        <span className={`text-lg font-extrabold uppercase tracking-wide px-4.5 py-2.5 rounded-lg border ${isRecommended ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
                            }`}>
                            {recommendationText}
                        </span>
                    </div>
                </section>

                {/* Dimension Breakdown Card Section */}
                <section className="md:col-span-2 rounded-2xl bg-zinc-900 border border-zinc-800 p-6 flex flex-col justify-center gap-5 shadow-sm">
                    <h2 className="text-base font-bold uppercase tracking-wider text-zinc-400 mb-2">Score Dimension Breakdown</h2>

                    {scoreDimensions.map((bar) => {
                        const numericValue = parseFloat(bar.score || '0') || 0;
                        return (
                            <div key={bar.id} className="space-y-1.5">
                                <div className="flex justify-between text-base font-semibold">
                                    <span className="text-zinc-200">{bar.label}</span>
                                    <span className="text-indigo-400 font-mono font-bold">{numericValue.toFixed(1)}/10.0</span>
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
                    <h2 className="text-base font-bold uppercase tracking-wider text-zinc-400 mb-3">Executive Rationale</h2>
                    <p className="text-base leading-relaxed text-zinc-300 whitespace-pre-line">{report.hiringRationale}</p>
                </section>

                {/* Core Strengths and Opportunities Matrix */}
                <div className="md:col-span-3 grid gap-6 md:grid-cols-2">
                    {/* Strengths Board */}
                    <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-sm">
                        <h2 className="text-base font-bold uppercase tracking-wider text-emerald-400 mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" /> STRENGTHS ARCHIVE
                        </h2>
                        <ul className="space-y-3">
                            {report.strengths.map((str, index) => (
                                <li key={`str-${index}`} className="text-base text-zinc-200 flex items-start gap-2.5 leading-relaxed">
                                    <span className="text-emerald-500 font-bold select-none" aria-hidden="true">&bull;</span>
                                    <span>{str}</span>
                                </li>
                            ))}
                        </ul>
                    </section>

                    {/* Opportunities Board */}
                    <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-sm">
                        <h2 className="text-base font-bold uppercase tracking-wider text-amber-400 mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-400" aria-hidden="true" /> REQUIRED OPPORTUNITY DELTAS
                        </h2>
                        <div className="space-y-5">
                            {report.improvements.map((imp, index) => (
                                <div key={`imp-${index}`} className="space-y-1.5 border-b border-zinc-850 pb-4 last:border-b-0 last:pb-0">
                                    <div className="flex items-center gap-2 justify-between">
                                        <span className="text-base font-extrabold text-zinc-100">{imp.area}</span>
                                        <span className={`px-2.5 py-1 rounded text-xs font-extrabold uppercase border tracking-wider ${imp.severity === 'high' ? 'bg-red-500/10 border-red-500/25 text-red-400' :
                                                imp.severity === 'medium' ? 'bg-amber-500/10 border-amber-500/25 text-amber-400' :
                                                    'bg-zinc-800 border-zinc-700 text-zinc-400'
                                            }`}>
                                            {imp.severity} severity
                                        </span>
                                    </div>
                                    <p className="text-base text-zinc-300 leading-relaxed">{imp.detail}</p>
                                    <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-850 text-sm leading-relaxed">
                                        <strong className="text-indigo-400 block mb-1 tracking-wide font-bold">Actionable Advice</strong>
                                        <span className="text-zinc-300">{imp.actionableAdvice}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                {/* Detailed Question & Response Log Section */}
                <section className="md:col-span-3 rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-sm space-y-6">
                    <div>
                        <h2 className="text-base font-bold uppercase tracking-wider text-zinc-400 mb-1">Detailed Question & Response Log</h2>
                        <p className="text-base text-zinc-300">Review your answers question-by-question alongside detailed AI criticism and suggestions for improvement.</p>
                    </div>

                    <div className="space-y-4">
                        {report.questions && report.questions.length > 0 ? (
                            report.questions.map((q) => {
                                const fb = questionFeedbackMap.get(q.sequenceNumber);
                                const isExpanded = expandedQuestionSeq === q.sequenceNumber;
                                
                                // Color badges for answer quality
                                const qualityColor = fb?.answerQuality === 'strong'
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                    : fb?.answerQuality === 'weak'
                                        ? 'bg-red-500/10 border-red-500/20 text-red-400'
                                        : 'bg-amber-500/10 border-amber-500/20 text-amber-400';

                                return (
                                    <div key={q.id} className="border border-zinc-800 bg-zinc-950/40 rounded-xl overflow-hidden transition-all duration-300">
                                        {/* Accordion Header */}
                                        <button
                                            onClick={() => setExpandedQuestionSeq(isExpanded ? null : q.sequenceNumber)}
                                            className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-zinc-900/40 transition-colors focus:outline-none"
                                        >
                                            <div className="flex flex-wrap items-center gap-3">
                                                <span className="text-base font-mono font-bold text-indigo-400">Q{q.sequenceNumber}</span>
                                                <span className="text-base font-bold text-zinc-200">{fb?.questionSummary || q.category}</span>
                                                <span className="px-2.5 py-0.5 rounded text-xs font-bold uppercase border tracking-wider bg-zinc-800 border-zinc-700 text-zinc-400">
                                                    {q.category}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {fb && (
                                                    <>
                                                        <span className={`px-2.5 py-0.5 rounded text-xs font-extrabold uppercase border tracking-wider ${qualityColor}`}>
                                                            {fb.answerQuality}
                                                        </span>
                                                        <span className="text-base font-mono font-extrabold text-zinc-300">
                                                            {(fb.score || 0).toFixed(1)}/10.0
                                                        </span>
                                                    </>
                                                )}
                                                <svg
                                                    className={`w-4 h-4 text-zinc-500 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                        </button>

                                        {/* Accordion Content */}
                                        {isExpanded && (
                                            <div className="px-5 pb-5 border-t border-zinc-850 bg-zinc-950/20 space-y-4 pt-4 animate-fade-in">
                                                {/* The Question Asked */}
                                                <div className="space-y-1.5">
                                                    <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Question Asked</h3>
                                                    <div className="text-base text-zinc-150 leading-relaxed bg-zinc-900/80 p-4 rounded-lg border border-zinc-850 font-medium">
                                                        {q.questionText}
                                                    </div>
                                                </div>

                                                {/* Candidate Response */}
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between items-center">
                                                        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Your Response</h3>
                                                        {q.answerDuration && (
                                                            <span className="text-xs font-mono text-zinc-500 font-semibold uppercase">
                                                                Duration: {q.answerDuration}s
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-base text-zinc-200 leading-relaxed bg-zinc-900/40 p-4 rounded-lg border border-zinc-850 whitespace-pre-line italic">
                                                        {q.userAnswer || 'No response provided.'}
                                                    </div>
                                                </div>

                                                {/* AI Assessment & Criticism */}
                                                {fb && (
                                                    <div className="space-y-4 pt-3 border-t border-zinc-850">
                                                        <div className="space-y-1.5">
                                                            <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-widest">AI Assessment</h3>
                                                            <p className="text-sm text-zinc-200 leading-relaxed">{fb.comment}</p>
                                                        </div>

                                                        {/* Suggestions for Improvement (Dynamic Fallback) */}
                                                        <div className="space-y-1.5">
                                                            <h3 className="text-sm font-bold text-amber-400 uppercase tracking-widest">How to Improve</h3>
                                                            <p className="text-sm text-zinc-300 leading-relaxed bg-amber-500/5 p-4 rounded-lg border border-amber-500/10">
                                                                {fb.suggestionsForImprovement || 'Structure your response clearly. Make sure to detail specific engineering constraints, tech details, and trade-offs rather than staying high-level.'}
                                                            </p>
                                                        </div>

                                                        {/* Model Response / Outline (Dynamic Fallback) */}
                                                        <div className="space-y-1.5">
                                                            <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-widest">Model Outline</h3>
                                                            <div className="text-sm text-zinc-300 leading-relaxed bg-emerald-500/5 p-4 rounded-lg border border-emerald-500/10 whitespace-pre-line">
                                                                {fb.idealResponseOutline || '1. Introduce the core concept directly and define key terms.\n2. Explain the architectural setup and how components interact.\n3. Mention engineering trade-offs (scalability, complexity, costs) to demonstrate senior-level maturity.'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-base text-zinc-500 text-center py-6 border border-dashed border-zinc-850 rounded-xl">
                                No questions were recorded in this session.
                            </div>
                        )}
                    </div>
                </section>

                {/* Study Targets Chips Section */}
                <section className="md:col-span-3 rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-sm">
                    <h2 className="text-base font-bold uppercase tracking-wider text-zinc-400 mb-4">Recommended Curated Study Focus Clusters</h2>
                    <div className="flex flex-wrap gap-2.5">
                        {report.studyRecommendations.map((study, index) => (
                            <span key={`study-${index}`} className="px-3.5 py-2 rounded-lg bg-zinc-950 border border-zinc-850 text-sm font-medium text-zinc-200 tracking-wide">
                                {study}
                            </span>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
}