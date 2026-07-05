'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import Link from 'next/link';
import { useTheme } from '@/hooks/useTheme';

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
    parentQuestionId?: string | null;
    followUps?: Question[];
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
    targetRole?: string;
    difficulty?: number;
}

export default function FeedbackReportPage() {
    const { id: sessionId } = useParams() as { id: string };
    const { token, loading } = useAuth();
    const router = useRouter();
    const { theme, toggleTheme } = useTheme();

    const [report, setReport] = useState<FeedbackReport | null>(null);
    const [error, setError] = useState(false);
    const [expandedQuestionSeq, setExpandedQuestionSeq] = useState<number | null>(1);
    const [exportOpen, setExportOpen] = useState(false);

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

    const groupedQuestions = useMemo(() => {
        if (!report?.questions) return [];
        // Filter out questions that have parentQuestionId set (meaning they are follow-ups)
        const majors = report.questions.filter((q) => !q.parentQuestionId);
        
        // Nest their follow-ups (only answered ones)
        return majors.map((mq, index) => {
            const followUps = report.questions!.filter(
                (q) => q.parentQuestionId === mq.id && q.userAnswer !== null
            );
            return {
                ...mq,
                sequenceNumber: index + 1,
                followUps,
            };
        });
    }, [report]);

    const generateStyledHTML = useCallback(() => {
        if (!report) return '';

        let improvementsHtml = '';
        if (report.improvements && report.improvements.length > 0) {
            report.improvements.forEach((imp) => {
                improvementsHtml += `
                <div class="improve-item">
                    <div class="improve-title">
                        🔴 ${imp.area}
                        <span class="badge ${imp.severity.toLowerCase()}">${imp.severity}</span>
                    </div>
                    <div class="improve-detail">${imp.detail}</div>
                    <div class="improve-advice"><strong>Actionable advice:</strong> ${imp.actionableAdvice}</div>
                </div>`;
            });
        } else {
            improvementsHtml = '<p>No major areas to improve identified.</p>';
        }

        let strengthsHtml = '';
        if (report.strengths && report.strengths.length > 0) {
            report.strengths.forEach((s) => {
                strengthsHtml += `<li>${s}</li>`;
            });
        } else {
            strengthsHtml = '<li>No major strengths noted.</li>';
        }

        let qnaHtml = '';
        groupedQuestions.forEach((q) => {
            const fb = questionFeedbackMap.get(q.sequenceNumber);
            let followupsHtml = '';
            if (q.followUps && q.followUps.length > 0) {
                followupsHtml += '<div class="followups">';
                q.followUps.forEach((f) => {
                    followupsHtml += `
                    <div class="followup-turn">
                        <div class="followup-q"><strong>Follow-up Q:</strong> ${f.questionText}</div>
                        <div class="followup-a"><strong>Your response:</strong> "${f.userAnswer || 'No response.'}"</div>
                    </div>`;
                });
                followupsHtml += '</div>';
            }

            let assessmentHtml = '';
            if (fb) {
                assessmentHtml += `
                <div class="ai-comment-card">
                    <div class="ai-comment-header">AI Score: ${fb.score.toFixed(1)}/10.0 | ${fb.answerQuality.toUpperCase()}</div>
                    <p style="margin: 4px 0 10px;">${fb.comment}</p>
                    <p style="margin: 0 0 10px;"><strong>How to Improve:</strong> ${fb.suggestionsForImprovement || 'N/A'}</p>
                    <p style="margin: 0;"><strong>Model Response Outline:</strong><br>${(fb.idealResponseOutline || '').replace(/\n/g, '<br>')}</p>
                </div>`;
            }

            qnaHtml += `
            <div class="dialogue-box">
                <div class="dialogue-q">
                    <span class="q-num">Q${q.sequenceNumber}</span>
                    <span class="q-cat">${q.category}</span>
                </div>
                <div class="q-text"><strong>Question:</strong> ${q.questionText}</div>
                <div class="ans-box"><strong>Your response:</strong> "${q.userAnswer || 'No response.'}"</div>
                ${followupsHtml}
                ${assessmentHtml}
            </div>`;
        });

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Mock Interview Feedback Report - ${report.targetRole}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background-color: #f8fafc;
            color: #0f172a;
            margin: 0;
            padding: 40px 20px;
            line-height: 1.5;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: #ffffff;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05);
            border: 1px solid #e2e8f0;
        }
        h1 {
            font-size: 28px;
            font-weight: 800;
            margin-top: 0;
            margin-bottom: 8px;
            color: #1e1b4b;
        }
        .meta {
            font-size: 14px;
            color: #64748b;
            margin-bottom: 30px;
            display: flex;
            gap: 15px;
        }
        .meta span {
            background: #f1f5f9;
            padding: 4px 10px;
            border-radius: 6px;
            font-weight: 500;
        }
        .grid {
            display: grid;
            grid-template-columns: 1fr 2fr;
            gap: 30px;
            margin-bottom: 40px;
        }
        .card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 24px;
        }
        .score-circle {
            width: 120px;
            height: 120px;
            border-radius: 50%;
            background: #f5f3ff;
            border: 4px solid #818cf8;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            margin: 0 auto 15px;
        }
        .score-val {
            font-size: 32px;
            font-weight: 800;
            color: #4f46e5;
            line-height: 1;
        }
        .score-lbl {
            font-size: 12px;
            font-weight: 600;
            color: #6366f1;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-top: 4px;
        }
        .dim-row {
            margin-bottom: 16px;
        }
        .dim-row:last-child {
            margin-bottom: 0;
        }
        .dim-header {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 6px;
            color: #334155;
        }
        .dim-bar-bg {
            width: 100%;
            height: 8px;
            background: #f1f5f9;
            border-radius: 4px;
            overflow: hidden;
        }
        .dim-bar-fill {
            height: 100%;
            background: #4f46e5;
            border-radius: 4px;
        }
        .section-title {
            font-size: 18px;
            font-weight: 700;
            margin-top: 0;
            margin-bottom: 15px;
            color: #1e293b;
            border-bottom: 2px solid #f1f5f9;
            padding-bottom: 8px;
        }
        .strength-list {
            padding-left: 20px;
            margin: 0;
        }
        .strength-list li {
            margin-bottom: 8px;
            font-size: 14px;
            color: #334155;
        }
        .improve-item {
            margin-bottom: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid #f1f5f9;
        }
        .improve-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }
        .improve-title {
            font-size: 15px;
            font-weight: 700;
            color: #0f172a;
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
        }
        .badge {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 2px 6px;
            border-radius: 4px;
            letter-spacing: 0.05em;
        }
        .badge.high { background: #fee2e2; color: #991b1b; }
        .badge.medium { background: #fef3c7; color: #92400e; }
        .badge.low { background: #f1f5f9; color: #475569; }
        .improve-detail {
            font-size: 14px;
            color: #475569;
            margin-bottom: 8px;
        }
        .improve-advice {
            font-size: 13px;
            background: #f8fafc;
            padding: 10px 12px;
            border-radius: 6px;
            border-left: 3px solid #cbd5e1;
            color: #334155;
            margin-top: 4px;
        }
        .dialogue-box {
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 25px;
            background: #ffffff;
            page-break-inside: avoid;
        }
        .dialogue-q {
            font-size: 14px;
            font-weight: 700;
            color: #1e1b4b;
            margin-bottom: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .q-num {
            font-size: 13px;
            font-weight: 800;
            color: #6366f1;
            background: #e0e7ff;
            padding: 2px 8px;
            border-radius: 4px;
        }
        .q-cat {
            font-size: 11px;
            color: #64748b;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .q-text {
            font-size: 14px;
            color: #1e293b;
            margin-bottom: 12px;
            line-height: 1.6;
        }
        .ans-box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px;
            font-style: italic;
            font-size: 13px;
            color: #334155;
            margin-bottom: 12px;
        }
        .followups {
            border-left: 2px solid #cbd5e1;
            padding-left: 15px;
            margin-bottom: 12px;
            margin-top: 12px;
        }
        .followup-turn {
            margin-bottom: 10px;
            padding-left: 5px;
        }
        .followup-turn:last-child {
            margin-bottom: 0;
        }
        .followup-q {
            font-size: 13px;
            font-weight: 600;
            color: #475569;
            margin-bottom: 2px;
        }
        .followup-a {
            font-size: 12px;
            font-style: italic;
            color: #475569;
        }
        .ai-comment-card {
            background: #f5f3ff;
            border: 1px solid #e0e7ff;
            border-radius: 8px;
            padding: 15px;
            font-size: 13px;
            color: #334155;
            margin-top: 15px;
        }
        .ai-comment-header {
            font-weight: 700;
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-size: 11px;
            color: #6366f1;
        }
        @media print {
            body {
                background: #ffffff;
                padding: 0;
            }
            .container {
                box-shadow: none;
                padding: 0;
                border: none;
                max-width: 100%;
            }
            .dialogue-box {
                page-break-inside: avoid;
            }
        }
        @media (max-width: 640px) {
            .grid {
                grid-template-columns: 1fr;
            }
            body {
                padding: 15px 10px;
            }
            .container {
                padding: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Mock Interview Feedback Report</h1>
        <div class="meta">
            <span>Role: ${report.targetRole}</span>
            <span>Difficulty: ${report.difficulty}/5</span>
        </div>

        <div class="grid">
            <div class="card" style="text-align: center;">
                <div class="score-circle">
                    <span class="score-val">${parseFloat(report.overallScore || '0').toFixed(1)}</span>
                    <span class="score-lbl">Overall</span>
                </div>
            </div>
            <div class="card">
                <div class="dim-row">
                    <div class="dim-header">
                        <span>Technical Accuracy</span>
                        <span>${parseFloat(report.technicalScore || '0').toFixed(1)}/10.0</span>
                    </div>
                    <div class="dim-bar-bg">
                        <div class="dim-bar-fill" style="width: ${parseFloat(report.technicalScore || '0') * 10}%;"></div>
                    </div>
                </div>
                <div class="dim-row">
                    <div class="dim-header">
                        <span>Communication Clarity</span>
                        <span>${parseFloat(report.communicationScore || '0').toFixed(1)}/10.0</span>
                    </div>
                    <div class="dim-bar-bg">
                        <div class="dim-bar-fill" style="width: ${parseFloat(report.communicationScore || '0') * 10}%;"></div>
                    </div>
                </div>
                <div class="dim-row">
                    <div class="dim-header">
                        <span>Answer Pacing</span>
                        <span>${parseFloat(report.pacingScore || '0').toFixed(1)}/10.0</span>
                    </div>
                    <div class="dim-bar-bg">
                        <div class="dim-bar-fill" style="width: ${parseFloat(report.pacingScore || '0') * 10}%;"></div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card" style="margin-bottom: 30px;">
            <div class="section-title">Key Strengths</div>
            <ul class="strength-list">
                ${strengthsHtml}
            </ul>
        </div>

        <div class="card" style="margin-bottom: 40px;">
            <div class="section-title">Areas to Improve</div>
            ${improvementsHtml}
        </div>

        <div class="section-title" style="font-size: 20px; margin-bottom: 25px;">Detailed Dialogue Transcript & AI Criticism</div>
        ${qnaHtml}
    </div>
</body>
</html>`;
    }, [report, groupedQuestions, questionFeedbackMap]);

    const handleDownload = useCallback((format: 'pdf' | 'html' | 'md') => {
        if (!report) return;

        if (format === 'md') {
            let markdownContent = `# Mock Interview Feedback Report\n\n`;
            markdownContent += `**Overall Score**: ${parseFloat(report.overallScore || '0').toFixed(1)}/10.0\n`;
            markdownContent += `**Technical Score**: ${parseFloat(report.technicalScore || '0').toFixed(1)}/10.0\n`;
            markdownContent += `**Communication Score**: ${parseFloat(report.communicationScore || '0').toFixed(1)}/10.0\n`;
            markdownContent += `**Pacing Score**: ${parseFloat(report.pacingScore || '0').toFixed(1)}/10.0\n`;
            if (report.codeQualityScore) {
                markdownContent += `**Code Design Quality Score**: ${parseFloat(report.codeQualityScore).toFixed(1)}/10.0\n`;
            }
            if (report.behavioralScore) {
                markdownContent += `**Behavioral Quality Score**: ${parseFloat(report.behavioralScore).toFixed(1)}/10.0\n`;
            }
            markdownContent += `\n---\n\n`;

            markdownContent += `## Key Strengths\n`;
            if (report.strengths && report.strengths.length > 0) {
                report.strengths.forEach((s) => {
                    markdownContent += `- ${s}\n`;
                });
            } else {
                markdownContent += `No major strengths noted.\n`;
            }
            markdownContent += `\n`;

            markdownContent += `## Areas to Improve\n`;
            if (report.improvements && report.improvements.length > 0) {
                report.improvements.forEach((imp) => {
                    markdownContent += `### 🔴 ${imp.area} [${imp.severity.toUpperCase()} SEVERITY]\n`;
                    markdownContent += `**Feedback**: ${imp.detail}\n\n`;
                    markdownContent += `**Actionable Advice**: ${imp.actionableAdvice}\n\n`;
                    markdownContent += `**Example from session**: *"${imp.exampleFromSession}"*\n\n`;
                });
            } else {
                markdownContent += `No major improvements requested.\n`;
            }
            markdownContent += `\n---\n\n`;

            markdownContent += `## Detailed Q&A Log & AI Criticism\n\n`;
            groupedQuestions.forEach((q) => {
                const fb = questionFeedbackMap.get(q.sequenceNumber);
                markdownContent += `### Q${q.sequenceNumber}: ${fb?.questionSummary || q.category} [${q.category.toUpperCase()}]\n`;
                markdownContent += `**Question**: ${q.questionText}\n\n`;
                markdownContent += `**Your Response**: *"${q.userAnswer || 'No response.'}"*\n\n`;
                
                if (q.followUps && q.followUps.length > 0) {
                    markdownContent += `**Follow-up Dialogue**:\n`;
                    q.followUps.forEach((f) => {
                        markdownContent += `- *Interviewer Follow-up*: ${f.questionText}\n`;
                        markdownContent += `- *Your Response*: *"${f.userAnswer || 'No response.'}"*\n`;
                    });
                    markdownContent += `\n`;
                }

                if (fb) {
                    markdownContent += `**AI Score**: ${fb.score.toFixed(1)}/10.0\n\n`;
                    markdownContent += `**Assessment**: ${fb.comment}\n\n`;
                    markdownContent += `**How to Improve**: ${fb.suggestionsForImprovement || 'N/A'}\n\n`;
                    markdownContent += `**Ideal Outline**:\n${fb.idealResponseOutline || 'N/A'}\n\n`;
                }
                markdownContent += `---\n\n`;
            });

            const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `interview_report_${sessionId}.md`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            const html = generateStyledHTML();
            if (format === 'html') {
                const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `interview_report_${sessionId}.html`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else if (format === 'pdf') {
                const printWindow = window.open('', '_blank');
                if (!printWindow) {
                    alert('Please allow popups to generate the PDF report.');
                    return;
                }
                printWindow.document.write(html);
                printWindow.document.close();
                
                printWindow.onload = () => {
                    printWindow.print();
                };
                setTimeout(() => {
                    if (printWindow.document.readyState === 'complete') {
                        printWindow.print();
                    }
                }, 1000);
            }
        }
    }, [report, groupedQuestions, questionFeedbackMap, sessionId, generateStyledHTML]);

    if (loading || (!report && !error)) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center" role="status" aria-live="polite">
                <span className="text-zinc-550 dark:text-zinc-400 animate-pulse text-base font-bold tracking-wider">COMPILING EVALUATIONS METRICS...</span>
            </div>
        );
    }

    if (error || !report) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
                <main className="max-w-md text-center" role="alert">
                    <h2 className="text-2xl font-bold text-red-500 mb-2">Failed to Load Report</h2>
                    <p className="text-base text-zinc-500 dark:text-zinc-400 mb-6">The evaluation job is either still processing or failed during server-side compilation updates.</p>
                    <Link href="/dashboard" className="px-6 py-3 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-sm font-bold text-zinc-700 dark:text-zinc-300 focus:outline-none">
                        Return to Dashboard
                    </Link>
                </main>
            </div>
        );
    }

    if (report.status !== 'COMPLETED') {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
                <main className="max-w-md text-center" role="alert">
                    {report.status === 'FAILED' ? (
                        <>
                            <h2 className="text-2xl font-bold text-red-500 mb-2">Grading Failed</h2>
                            <p className="text-base text-zinc-550 dark:text-zinc-400 mb-6">Something went wrong while grading your mock interview session. Please try again or contact support.</p>
                        </>
                    ) : (
                        <>
                            <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-2 animate-pulse">Grading In Progress</h2>
                            <p className="text-base text-zinc-550 dark:text-zinc-400 mb-6">Your mock interview is being graded by our AI assessor. This usually takes 5-15 seconds. Please refresh the page shortly.</p>
                            <button
                                onClick={() => window.location.reload()}
                                className="px-6 py-3 rounded-lg bg-indigo-650 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-sm font-bold text-white focus:outline-none mr-3 cursor-pointer"
                            >
                                Refresh Page
                            </button>
                        </>
                    )}
                    <Link href="/dashboard" className="px-6 py-3 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-sm font-bold text-zinc-700 dark:text-zinc-300 focus:outline-none">
                        Return to Dashboard
                    </Link>
                </main>
            </div>
        );
    }



    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans pb-20 select-none transition-colors duration-200">
            <header className="border-b border-zinc-200 dark:border-zinc-900 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">
                <div className="flex items-center gap-3">
                    <Link href="/dashboard" className="text-base font-bold text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 focus:outline-none">
                        &larr; Back
                    </Link>
                    <span className="text-base text-zinc-300 dark:text-zinc-800" aria-hidden="true">|</span>
                    <h1 className="text-base font-extrabold text-zinc-800 dark:text-zinc-200 font-mono tracking-wider">ASSESSMENT LEDGER ANALYTICS</h1>
                </div>
                <div className="flex items-center gap-3 relative">
                    <button
                        onClick={toggleTheme}
                        className="p-2.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-850 text-zinc-650 dark:text-zinc-350 transition-colors cursor-pointer"
                        aria-label="Toggle Theme Mode"
                    >
                        {theme === 'dark' ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                            </svg>
                        )}
                    </button>
                    
                    <div className="relative">
                        <button
                            onClick={() => setExportOpen(!exportOpen)}
                            className="px-5 py-2.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-sm font-bold text-zinc-700 dark:text-zinc-300 transition-colors focus:outline-none cursor-pointer flex items-center gap-2 select-none"
                        >
                            Export Report
                            <svg className={`w-4 h-4 text-zinc-550 dark:text-zinc-400 transform transition-transform duration-200 ${exportOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        
                        {exportOpen && (
                            <div className="absolute right-0 mt-2 w-48 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl z-50 overflow-hidden py-1.5">
                                <button
                                    onClick={() => { handleDownload('pdf'); setExportOpen(false); }}
                                    className="w-full px-4 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer select-none font-medium flex items-center gap-2"
                                >
                                    📄 PDF Document
                                </button>
                                <button
                                    onClick={() => { handleDownload('html'); setExportOpen(false); }}
                                    className="w-full px-4 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer select-none font-medium flex items-center gap-2"
                                >
                                    🌐 HTML Webpage
                                </button>
                                <button
                                    onClick={() => { handleDownload('md'); setExportOpen(false); }}
                                    className="w-full px-4 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer select-none font-medium flex items-center gap-2"
                                >
                                    ✍️ Markdown File
                                </button>
                            </div>
                        )}
                    </div>
                    
                    <Link href="/dashboard" className="px-5 py-2.5 rounded-lg bg-indigo-650 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-sm font-bold text-white transition-colors focus:outline-none">
                        Go to Dashboard
                    </Link>
                </div>
            </header>

            <main className="max-w-5xl w-full mx-auto px-6 mt-12 grid gap-8 md:grid-cols-3">
                {/* Radial Rating Card Section */}
                <section className="md:col-span-1 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 flex flex-col items-center justify-center text-center shadow-sm">
                    <h2 className="text-base font-bold uppercase tracking-wider text-zinc-450 dark:text-zinc-400 mb-6">Overall Rating</h2>

                    <div className="relative w-36 h-36 flex items-center justify-center animate-fade-in" aria-label={`Overall score is ${radialMetrics.scoreNum.toFixed(1)} out of 10`}>
                        <svg className="w-full h-full transform -rotate-90" aria-hidden="true">
                            <circle cx="72" cy="72" r="64" stroke="currentColor" className="text-zinc-100 dark:text-zinc-800" strokeWidth="8" fill="transparent" />
                            <circle
                                cx="72" cy="72" r="64"
                                stroke="#4f46e5" strokeWidth="8" fill="transparent"
                                strokeDasharray="402"
                                strokeDashoffset={radialMetrics.strokeOffset}
                                strokeLinecap="round"
                                className="transition-all duration-500 ease-out"
                            />
                        </svg>
                        <span className="absolute text-4xl font-extrabold text-zinc-900 dark:text-white font-mono">{radialMetrics.scoreNum.toFixed(1)}</span>
                    </div>

                </section>

                {/* Dimension Breakdown Card Section */}
                <section className="md:col-span-2 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 flex flex-col justify-center gap-5 shadow-sm">
                    <h2 className="text-base font-bold uppercase tracking-wider text-zinc-450 dark:text-zinc-400 mb-2">Score Dimension Breakdown</h2>

                    {scoreDimensions.map((bar) => {
                        const numericValue = parseFloat(bar.score || '0') || 0;
                        return (
                            <div key={bar.id} className="space-y-1.5">
                                <div className="flex justify-between text-base font-semibold">
                                    <span className="text-zinc-700 dark:text-zinc-200">{bar.label}</span>
                                    <span className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">{numericValue.toFixed(1)}/10.0</span>
                                </div>
                                <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-950 rounded-full overflow-hidden" aria-hidden="true">
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
                <section className="md:col-span-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
                    <h2 className="text-base font-bold uppercase tracking-wider text-zinc-450 dark:text-zinc-400 mb-3">Executive Rationale</h2>
                    <p className="text-base leading-relaxed text-zinc-650 dark:text-zinc-300 whitespace-pre-line">{report.hiringRationale}</p>
                </section>

                {/* Core Strengths and Opportunities Matrix */}
                <div className="md:col-span-3 grid gap-6 md:grid-cols-2">
                    {/* Strengths Board */}
                    <section className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
                        <h2 className="text-base font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400" aria-hidden="true" /> STRENGTHS ARCHIVE
                        </h2>
                        <ul className="space-y-3">
                            {report.strengths.map((str, index) => (
                                <li key={`str-${index}`} className="text-base text-zinc-700 dark:text-zinc-200 flex items-start gap-2.5 leading-relaxed">
                                    <span className="text-emerald-500 font-bold select-none" aria-hidden="true">&bull;</span>
                                    <span>{str}</span>
                                </li>
                            ))}
                        </ul>
                    </section>

                    {/* Opportunities Board */}
                    <section className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
                        <h2 className="text-base font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400" aria-hidden="true" /> REQUIRED OPPORTUNITY DELTAS
                        </h2>
                        <div className="space-y-5">
                            {report.improvements.map((imp, index) => (
                                <div key={`imp-${index}`} className="space-y-1.5 border-b border-zinc-100 dark:border-zinc-850 pb-4 last:border-b-0 last:pb-0">
                                    <div className="flex items-center gap-2 justify-between">
                                        <span className="text-base font-extrabold text-zinc-800 dark:text-zinc-100">{imp.area}</span>
                                        <span className={`px-2.5 py-1 rounded text-xs font-extrabold uppercase border tracking-wider ${imp.severity === 'high' ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25 text-red-700 dark:text-red-400' :
                                                imp.severity === 'medium' ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/25 text-amber-700 dark:text-amber-400' :
                                                    'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                                            }`}>
                                            {imp.severity} severity
                                        </span>
                                    </div>
                                    <p className="text-base text-zinc-600 dark:text-zinc-300 leading-relaxed">{imp.detail}</p>
                                    <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-lg border border-zinc-200 dark:border-zinc-850 text-sm leading-relaxed">
                                        <strong className="text-indigo-650 dark:text-indigo-400 block mb-1 tracking-wide font-bold">Actionable Advice</strong>
                                        <span className="text-zinc-700 dark:text-zinc-300">{imp.actionableAdvice}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                {/* Detailed Question & Response Log Section */}
                <section className="md:col-span-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm space-y-6">
                    <div>
                        <h2 className="text-base font-bold uppercase tracking-wider text-zinc-450 dark:text-zinc-400 mb-1">Detailed Question & Response Log</h2>
                        <p className="text-base text-zinc-550 dark:text-zinc-300">Review your answers question-by-question alongside detailed AI criticism and suggestions for improvement.</p>
                    </div>

                    <div className="space-y-4">
                        {groupedQuestions.length > 0 ? (
                            groupedQuestions.map((q) => {
                                const fb = questionFeedbackMap.get(q.sequenceNumber);
                                const isExpanded = expandedQuestionSeq === q.sequenceNumber;
                                
                                // Color badges for answer quality
                                const qualityColor = fb?.answerQuality === 'strong'
                                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-250 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                                    : fb?.answerQuality === 'weak'
                                        ? 'bg-red-50 dark:bg-red-500/10 border-red-250 dark:border-red-500/20 text-red-700 dark:text-red-400'
                                        : 'bg-amber-50 dark:bg-amber-500/10 border-amber-250 dark:border-amber-500/20 text-amber-700 dark:text-amber-400';

                                return (
                                    <div key={q.id} className="border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 rounded-xl overflow-hidden transition-all duration-300">
                                        {/* Accordion Header */}
                                        <button
                                            onClick={() => setExpandedQuestionSeq(isExpanded ? null : q.sequenceNumber)}
                                            className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-zinc-100/50 dark:hover:bg-zinc-900/40 transition-colors focus:outline-none"
                                        >
                                            <div className="flex flex-wrap items-center gap-3">
                                                <span className="text-base font-mono font-bold text-indigo-650 dark:text-indigo-400">Q{q.sequenceNumber}</span>
                                                <span className="text-base font-bold text-zinc-850 dark:text-zinc-200">{fb?.questionSummary || q.category}</span>
                                                <span className="px-2.5 py-0.5 rounded text-xs font-bold uppercase border tracking-wider bg-zinc-150 border-zinc-250 text-zinc-600 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400">
                                                    {q.category}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {fb && (
                                                    <>
                                                        <span className={`px-2.5 py-0.5 rounded text-xs font-extrabold uppercase border tracking-wider ${qualityColor}`}>
                                                            {fb.answerQuality}
                                                        </span>
                                                        <span className="text-base font-mono font-extrabold text-zinc-700 dark:text-zinc-300">
                                                            {(fb.score || 0).toFixed(1)}/10.0
                                                        </span>
                                                    </>
                                                )}
                                                <svg
                                                    className={`w-4 h-4 text-zinc-450 dark:text-zinc-500 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
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
                                            <div className="px-5 pb-5 border-t border-zinc-200 dark:border-zinc-850 bg-zinc-50/20 dark:bg-zinc-950/20 space-y-4 pt-4 animate-fade-in">
                                                {/* The Question Asked */}
                                                <div className="space-y-1.5">
                                                    <h3 className="text-xs font-bold text-zinc-450 dark:text-zinc-500 uppercase tracking-widest">Question Asked</h3>
                                                    <div className="text-base text-zinc-850 dark:text-zinc-150 leading-relaxed bg-zinc-100/50 dark:bg-zinc-900/80 p-4 rounded-lg border border-zinc-200 dark:border-zinc-850 font-medium">
                                                        {q.questionText}
                                                    </div>
                                                </div>

                                                {/* Candidate Response */}
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between items-center">
                                                        <h3 className="text-xs font-bold text-zinc-455 dark:text-zinc-550 uppercase tracking-widest">Your Response</h3>
                                                        {q.answerDuration && (
                                                            <span className="text-xs font-mono text-zinc-500 font-semibold uppercase">
                                                                Duration: {q.answerDuration}s
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-base text-zinc-750 dark:text-zinc-200 leading-relaxed bg-zinc-100/20 dark:bg-zinc-900/40 p-4 rounded-lg border border-zinc-200 dark:border-zinc-850 whitespace-pre-line italic">
                                                        {q.userAnswer || 'No response provided.'}
                                                    </div>
                                                </div>

                                                {/* Follow-up exchanges (if any) */}
                                                {q.followUps && q.followUps.length > 0 && (
                                                    <div className="space-y-4 pt-4 border-t border-zinc-200 dark:border-zinc-850/60 animate-fade-in">
                                                        <h4 className="text-xs font-bold text-zinc-450 dark:text-zinc-500 uppercase tracking-wider mb-2.5">Follow-up Dialogue</h4>
                                                        {q.followUps.map((f) => (
                                                            <div key={f.id} className="space-y-3.5 pl-4 border-l-2 border-zinc-200 dark:border-zinc-800 mb-4 last:mb-0">
                                                                <div className="space-y-1.5">
                                                                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Interviewer Follow-up</span>
                                                                    <div className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed bg-zinc-100/40 dark:bg-zinc-900/60 p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-850">
                                                                        {f.questionText}
                                                                    </div>
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    <span className="text-xs font-bold text-zinc-450 dark:text-zinc-400 uppercase tracking-widest">Your Response</span>
                                                                    <div className="text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed bg-zinc-100/10 dark:bg-zinc-900/20 p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-850 italic">
                                                                        {f.userAnswer || 'No response provided.'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* AI Assessment & Criticism */}
                                                {fb && (
                                                    <div className="space-y-4 pt-3 border-t border-zinc-200 dark:border-zinc-850">
                                                        <div className="space-y-1.5">
                                                            <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">AI Assessment</h3>
                                                            <p className="text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed">{fb.comment}</p>
                                                        </div>

                                                        {/* Suggestions for Improvement (Dynamic Fallback) */}
                                                        <div className="space-y-1.5">
                                                            <h3 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">How to Improve</h3>
                                                            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed bg-amber-500/5 p-4 rounded-lg border border-amber-500/10">
                                                                {fb.suggestionsForImprovement || 'Structure your response clearly. Make sure to detail specific engineering constraints, tech details, and trade-offs rather than staying high-level.'}
                                                            </p>
                                                        </div>

                                                        {/* Model Response / Outline (Dynamic Fallback) */}
                                                        <div className="space-y-1.5">
                                                            <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Model Outline</h3>
                                                            <div className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed bg-emerald-500/5 p-4 rounded-lg border border-emerald-500/10 whitespace-pre-line">
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
                            <div className="text-base text-zinc-500 dark:text-zinc-450 text-center py-6 border border-dashed border-zinc-200 dark:border-zinc-850 rounded-xl">
                                No questions were recorded in this session.
                            </div>
                        )}
                    </div>
                </section>

                {/* Study Targets Chips Section */}
                <section className="md:col-span-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
                    <h2 className="text-base font-bold uppercase tracking-wider text-zinc-450 dark:text-zinc-400 mb-4">Recommended Curated Study Focus Clusters</h2>
                    <div className="flex flex-wrap gap-2.5">
                        {report.studyRecommendations.map((study, index) => (
                            <span key={`study-${index}`} className="px-3.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 text-sm font-medium text-zinc-800 dark:text-zinc-200 tracking-wide">
                                {study}
                            </span>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
}