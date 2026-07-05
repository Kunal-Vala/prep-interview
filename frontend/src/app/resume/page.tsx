'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import Link from 'next/link';
import { useTheme } from '@/hooks/useTheme';

interface ResumeAnalysisResult {
    atsScore: number;
    formattingScore: number;
    skillsScore: number;
    jobAlignmentScore: number;
    profileSummary: string;
    extractedSkills: {
        technical: string[];
        soft: string[];
        missing: string[];
    };
    experienceAnalysis: Array<{
        company: string;
        role: string;
        duration: string;
        impactEvaluation: string;
    }>;
    atsFormattingIssues: string[];
    actionableImprovements: Array<{
        section: string;
        issue: string;
        recommendation: string;
        exampleBefore?: string;
        exampleAfter?: string;
    }>;
    targetRoleAlignment: {
        role: string;
        alignmentSummary: string;
        skillsGap: string[];
    };
}

export default function ResumeAnalyzerPage() {
    const { token, user, loading, logout } = useAuth();
    const router = useRouter();
    const { theme, toggleTheme } = useTheme();

    // Component states
    const [targetRole, setTargetRole] = useState('Senior Software Engineer');
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [loadingStep, setLoadingStep] = useState(0);
    const [report, setReport] = useState<ResumeAnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'skills' | 'experience' | 'improvements'>('overview');

    // Enforce authentication guard
    useEffect(() => {
        if (!loading && !token) {
            router.push('/login');
        }
    }, [token, loading, router]);

    // Load existing analysis on mount if available
    useEffect(() => {
        if (!token) return;

        async function loadExistingResume() {
            try {
                const res = await api.get('/resume');
                if (res.data) {
                    setReport(res.data);
                    if (res.data.targetRoleAlignment?.role) {
                        setTargetRole(res.data.targetRoleAlignment.role);
                    }
                }
            } catch (err) {
                console.error('Failed to load existing resume analysis:', err);
            }
        }

        loadExistingResume();
    }, [token]);

    // Animated loading step simulator
    useEffect(() => {
        if (!uploading) return;

        const stepIntervals = [
            setTimeout(() => setLoadingStep(1), 2000), // parsing
            setTimeout(() => setLoadingStep(2), 5500), // evaluating
            setTimeout(() => setLoadingStep(3), 9000), // formatting
        ];

        return () => {
            stepIntervals.forEach(clearTimeout);
        };
    }, [uploading]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        setError(null);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const droppedFile = files[0];
            if (droppedFile.type === 'application/pdf') {
                setFile(droppedFile);
            } else {
                setError('Currently, we only support resume analysis from PDF documents.');
            }
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setError(null);
        const files = e.target.files;
        if (files && files.length > 0) {
            setFile(files[0]);
        }
    };

    const handleAnalyze = async () => {
        if (!file) return;

        setUploading(true);
        setLoadingStep(0);
        setError(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('targetRole', targetRole.trim());

        try {
            const res = await api.post('/resume/analyze', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            setReport(res.data);
        } catch (err) {
            console.error('ATS analyzer failure:', err);
            setError('Failed to complete ATS resume analysis. Please verify target role and try again.');
        } finally {
            setUploading(false);
        }
    };

    const resetAnalyzer = () => {
        setFile(null);
        setReport(null);
        setError(null);
    };

    const renderRadialScore = (score: number, label: string) => {
        const strokeWidth = 8;
        const radius = 42;
        const circumference = 2 * Math.PI * radius;
        const strokeOffset = circumference - (circumference * score) / 100;

        return (
            <div className="flex flex-col items-center p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group hover:border-zinc-300 dark:hover:border-zinc-700 transition-all">
                <div className="relative w-28 h-28 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                        {/* Background Track */}
                        <circle
                            cx="56"
                            cy="56"
                            r={radius}
                            stroke="currentColor"
                            className="text-zinc-100 dark:text-zinc-800"
                            strokeWidth={strokeWidth}
                            fill="transparent"
                        />
                        {/* Active Indicator */}
                        <circle
                            cx="56"
                            cy="56"
                            r={radius}
                            stroke="#6366f1"
                            strokeWidth={strokeWidth}
                            fill="transparent"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeOffset}
                            strokeLinecap="round"
                            className="transition-all duration-700 ease-out"
                        />
                    </svg>
                    <span className="absolute text-2xl font-extrabold text-zinc-900 dark:text-white font-mono group-hover:scale-105 transition-transform">
                        {score}
                    </span>
                </div>
                <span className="mt-4 text-sm font-bold text-zinc-550 dark:text-zinc-400 uppercase tracking-wider text-center">
                    {label}
                </span>
            </div>
        );
    };

    if (loading || !user) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center" role="status" aria-live="polite">
                <span className="text-zinc-500 animate-pulse text-base font-semibold tracking-wider">SECURE SHIELD LOADING...</span>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans select-none transition-colors duration-200">
            {/* Navigation Header */}
            <header className="border-b border-zinc-200 dark:border-zinc-900 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-lg text-white" aria-hidden="true">A</div>
                        <span className="font-extrabold tracking-tight bg-gradient-to-r from-zinc-800 to-zinc-550 dark:from-zinc-550 dark:to-zinc-400 bg-clip-text text-transparent">Antigravity Prep</span>
                    </div>
                    <nav className="hidden md:flex items-center gap-6 text-sm font-semibold">
                        <Link href="/dashboard" className="text-zinc-500 dark:text-zinc-450 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Interviews</Link>
                        <Link href="/resume" className="text-zinc-900 dark:text-zinc-100 font-bold hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Resume Analyzer</Link>
                    </nav>
                </div>
                <div className="flex items-center gap-4">
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
                    <span className="text-sm text-zinc-550 dark:text-zinc-400 font-medium hidden sm:inline">Hello, <strong className="text-zinc-800 dark:text-zinc-200">{user.displayName}</strong></span>
                    <button onClick={logout} className="text-sm font-semibold px-3.5 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-850 text-zinc-700 dark:text-zinc-355 transition-colors cursor-pointer border border-zinc-200/50 dark:border-zinc-800/50">Sign Out</button>
                </div>
            </header>

            <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 flex flex-col">
                {/* Banner Title */}
                <div className="mb-10">
                    <h1 className="text-4xl font-extrabold text-zinc-900 dark:text-zinc-50 mb-2 tracking-tight">Resume ATS Optimizer</h1>
                    <p className="text-base text-zinc-650 dark:text-zinc-300">Run simulated applicant tracking system audits, analyze missing keywords, and polish work experience impact.</p>
                </div>

                {error && (
                    <div role="alert" className="p-4 mb-6 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl text-base text-red-700 dark:text-red-400 flex justify-between items-center">
                        <span>{error}</span>
                        <button onClick={() => setError(null)} className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 font-bold">Dismiss</button>
                    </div>
                )}

                {/* Loader Progress Screen */}
                {uploading ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-3xl relative overflow-hidden shadow-sm">
                        <div className="absolute top-0 inset-x-0 h-1 bg-zinc-100 dark:bg-zinc-950 overflow-hidden" aria-hidden="true">
                            <div className="h-full bg-indigo-500 w-1/3 rounded-full animate-infinite-scroll" style={{ animation: 'infinite-scroll 1.5s infinite linear' }} />
                        </div>
                        <div className="w-16 h-16 rounded-full border-4 border-zinc-200 dark:border-zinc-850 border-t-indigo-500 animate-spin mb-6" />
                        <div className="space-y-2 text-center">
                            <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">Analyzing Resume</h2>
                            <p className="text-base text-indigo-600 dark:text-indigo-400 font-medium animate-pulse" role="status">
                                {loadingStep === 0 && 'Parsing PDF layout structure...'}
                                {loadingStep === 1 && 'Extracting core skills & matching job context...'}
                                {loadingStep === 2 && 'Running ATS scoring simulation matrices...'}
                                {loadingStep === 3 && 'Compiling suggestions and format feedback...'}
                            </p>
                        </div>
                    </div>
                ) : !report ? (
                    /* Upload State Screen */
                    <div className="grid md:grid-cols-3 gap-8 items-start">
                        <div className="md:col-span-1 space-y-6">
                            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm space-y-4">
                                <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">Setup Analyzer</h2>
                                <p className="text-sm text-zinc-550 dark:text-zinc-400 leading-relaxed">Enter the target position you are seeking. We will grade your resume and extract missing keywords specifically for this role.</p>

                                <div className="space-y-1.5">
                                    <label htmlFor="role-field" className="block text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Target Role</label>
                                    <input
                                        id="role-field"
                                        type="text"
                                        value={targetRole}
                                        onChange={(e) => setTargetRole(e.target.value)}
                                        className="w-full px-4 py-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 text-base text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500"
                                        placeholder="e.g. Senior Frontend Developer"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={`border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center min-h-[350px] transition-all cursor-pointer ${isDragOver
                                    ? 'border-indigo-500 bg-indigo-500/5 shadow-inner'
                                    : 'border-zinc-250 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 hover:border-zinc-400 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900/60'
                                    }`}
                                onClick={() => document.getElementById('file-picker')?.click()}
                            >
                                <input
                                    id="file-picker"
                                    type="file"
                                    accept=".pdf"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                                <div className="w-16 h-16 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 flex items-center justify-center mb-6 text-zinc-400 group-hover:text-indigo-400 transition-colors shadow-sm">
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                </div>

                                {file ? (
                                    <div className="text-center space-y-2">
                                        <p className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{file.name}</p>
                                        <p className="text-xs text-zinc-450 dark:text-zinc-400 font-mono">{(file.size / 1024 / 1024).toFixed(2)} MB • PDF Document</p>
                                    </div>
                                ) : (
                                    <div className="text-center space-y-2">
                                        <p className="text-lg font-bold text-zinc-700 dark:text-zinc-200">Drag & drop your resume PDF here</p>
                                        <p className="text-sm text-zinc-500">or click to browse your local filesystem</p>
                                    </div>
                                )}
                            </div>

                            {file && (
                                <div className="mt-6 flex justify-end">
                                    <button
                                        onClick={handleAnalyze}
                                        className="px-8 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-base shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
                                    >
                                        Analyze ATS Optimization
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    /* Analysis Dashboard Display Screen */
                    <div className="space-y-8 flex-1 flex flex-col">
                        {/* Header info */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl gap-4 shadow-sm">
                            <div>
                                <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 block mb-1">ATS ANALYSIS REPORT</span>
                                <h2 className="text-xl font-extrabold text-zinc-850 dark:text-zinc-100">Aligned with: <strong className="text-zinc-800 dark:text-zinc-50">{report.targetRoleAlignment?.role || targetRole}</strong></h2>
                            </div>
                            <button
                                onClick={resetAnalyzer}
                                className="px-5 py-2.5 rounded-xl bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-sm font-bold border border-zinc-200 dark:border-zinc-700 transition-all cursor-pointer whitespace-nowrap"
                            >
                                Upload New Resume
                            </button>
                        </div>

                        {/* Overall scores */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {renderRadialScore(report.atsScore, 'ATS Fit Score')}
                            {renderRadialScore(report.jobAlignmentScore, 'Role Alignment')}
                            {renderRadialScore(report.skillsScore, 'Skills Coverage')}
                            {renderRadialScore(report.formattingScore, 'Format & Layout')}
                        </div>

                        {/* Dashboard Navigation Tabs */}
                        <div className="border-b border-zinc-200 dark:border-zinc-850 flex gap-6 text-base font-semibold">
                            <button
                                onClick={() => setActiveTab('overview')}
                                className={`pb-3 relative transition-colors cursor-pointer ${activeTab === 'overview' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500 font-bold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                            >
                                Overview
                            </button>
                            <button
                                onClick={() => setActiveTab('skills')}
                                className={`pb-3 relative transition-colors cursor-pointer ${activeTab === 'skills' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500 font-bold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                            >
                                Keywords & Gaps
                            </button>
                            <button
                                onClick={() => setActiveTab('experience')}
                                className={`pb-3 relative transition-colors cursor-pointer ${activeTab === 'experience' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500 font-bold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                            >
                                Experience Audit
                            </button>
                            <button
                                onClick={() => setActiveTab('improvements')}
                                className={`pb-3 relative transition-colors cursor-pointer ${activeTab === 'improvements' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500 font-bold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                            >
                                Suggested Rewrites ({report.actionableImprovements.length})
                            </button>
                        </div>

                        {/* Tabs content rendering */}
                        <div className="flex-1">
                            {activeTab === 'overview' && (
                                <div className="grid md:grid-cols-3 gap-6 items-start">
                                    <div className="md:col-span-2 space-y-6">
                                        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl space-y-3">
                                            <h3 className="text-base font-bold text-zinc-700 dark:text-zinc-150 uppercase tracking-wide">Professional Profile Summary</h3>
                                            <p className="text-base text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-line">{report.profileSummary || 'Profile parsed successfully.'}</p>
                                        </section>

                                        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl space-y-3">
                                            <h3 className="text-base font-bold text-zinc-700 dark:text-zinc-150 uppercase tracking-wide">Target Role Fit Summary</h3>
                                            <p className="text-base text-zinc-600 dark:text-zinc-300 leading-relaxed">{report.targetRoleAlignment?.alignmentSummary || 'No analysis data recorded.'}</p>
                                        </section>
                                    </div>

                                    <div className="md:col-span-1 space-y-6">
                                        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl space-y-4">
                                            <h3 className="text-base font-bold text-zinc-700 dark:text-zinc-150 uppercase tracking-wide">ATS Formatting Checklist</h3>
                                            <div className="space-y-3">
                                                {report.atsFormattingIssues.length === 0 ? (
                                                    <div className="flex items-center gap-3 text-sm text-emerald-600 dark:text-emerald-400">
                                                        <span className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center text-xs">✓</span>
                                                        <span>No major parsing inhibitors found. Layout is ATS-safe!</span>
                                                    </div>
                                                ) : (
                                                    report.atsFormattingIssues.map((issue, idx) => (
                                                        <div key={idx} className="flex items-start gap-3 text-sm text-zinc-600 dark:text-zinc-300">
                                                            <span className="w-5 h-5 mt-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs font-bold">!</span>
                                                            <span>{issue}</span>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </section>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'skills' && (
                                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl space-y-6">
                                    {report.extractedSkills.missing.length > 0 && (
                                        <div className="space-y-3">
                                            <h3 className="text-sm font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Missing ATS Keywords</h3>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400">Add these key skills to your resume to increase keyword match rate for **{targetRole}**.</p>
                                            <div className="flex flex-wrap gap-2">
                                                {report.extractedSkills.missing.map((skill, idx) => (
                                                    <span key={idx} className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 text-sm font-medium text-amber-800 dark:text-amber-300 tracking-wide animate-pulse">
                                                        {skill}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-850">
                                        <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Identified Technical Skills</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {report.extractedSkills.technical.length === 0 ? (
                                                <span className="text-sm text-zinc-500">None extracted.</span>
                                            ) : (
                                                report.extractedSkills.technical.map((skill, idx) => (
                                                    <span key={idx} className="px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                                        {skill}
                                                    </span>
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    {report.extractedSkills.soft.length > 0 && (
                                        <div className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-850">
                                            <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Identified Soft Skills</h3>
                                            <div className="flex flex-wrap gap-2">
                                                {report.extractedSkills.soft.map((skill, idx) => (
                                                    <span key={idx} className="px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 text-sm font-medium text-zinc-650 dark:text-zinc-400">
                                                        {skill}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'experience' && (
                                <div className="space-y-4">
                                    {report.experienceAnalysis.length === 0 ? (
                                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl text-center text-zinc-500">
                                            No experience records parsed from the resume structure.
                                        </div>
                                    ) : (
                                        report.experienceAnalysis.map((exp, idx) => (
                                            <div key={idx} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl space-y-3 shadow-sm">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-850 pb-3">
                                                    <div>
                                                        <h3 className="text-lg font-bold text-zinc-850 dark:text-zinc-100">{exp.role}</h3>
                                                        <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">{exp.company}</p>
                                                    </div>
                                                    <span className="text-sm text-zinc-450 dark:text-zinc-500 font-mono font-medium">{exp.duration}</span>
                                                </div>
                                                <div className="space-y-1">
                                                    <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Impact Audit Evaluation</h4>
                                                    <p className="text-base text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-line">{exp.impactEvaluation}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {activeTab === 'improvements' && (
                                <div className="space-y-4">
                                    {report.actionableImprovements.length === 0 ? (
                                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl text-center text-zinc-500">
                                            Excellent work! No major improvement targets found.
                                        </div>
                                    ) : (
                                        report.actionableImprovements.map((imp, idx) => (
                                            <div key={idx} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl space-y-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all shadow-sm">
                                                <div className="flex items-center gap-3 justify-between border-b border-zinc-100 dark:border-zinc-850 pb-3">
                                                    <span className="text-base font-extrabold text-zinc-850 dark:text-zinc-100">{imp.section}</span>
                                                    <span className="px-2.5 py-1 rounded text-xs font-extrabold uppercase border tracking-wider bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400">
                                                        {imp.issue}
                                                    </span>
                                                </div>

                                                <p className="text-base text-zinc-750 dark:text-zinc-300 leading-relaxed font-semibold">{imp.recommendation}</p>

                                                {imp.exampleBefore && imp.exampleAfter && (
                                                    <div className="grid sm:grid-cols-2 gap-4 pt-2">
                                                        <div className="bg-red-50/50 dark:bg-red-950/10 border border-red-100 dark:border-red-900/20 p-4 rounded-xl space-y-1.5">
                                                            <h4 className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-widest">Before</h4>
                                                            <p className="text-sm text-zinc-500 dark:text-zinc-400 italic">&quot;{imp.exampleBefore}&quot;</p>
                                                        </div>
                                                        <div className="bg-emerald-50/30 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/20 p-4 rounded-xl space-y-1.5">
                                                            <h4 className="text-xs font-bold text-emerald-750 dark:text-emerald-400 uppercase tracking-widest">After (ATS Optimized)</h4>
                                                            <p className="text-sm text-zinc-800 dark:text-zinc-200 font-medium">&quot;{imp.exampleAfter}&quot;</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}