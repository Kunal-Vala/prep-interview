# AI Interview: AI Mock Interviewer & Resume ATS Optimizer

An advanced, end-to-end web application that simulates real-world senior-level technical interviews and optimizes professional resumes for Applicant Tracking Systems (ATS).

---

## 🏗️ System Architecture

```mermaid
graph TD
    Client[Next.js Client SPA] <-->|HTTPS / REST API| NestJS[NestJS Gateway API]
    Client <-->|WebSocket Connection| WSGateway[Socket.io Gateway]
    NestJS <-->|Prisma ORM| Postgres[(PostgreSQL DB)]
    NestJS <-->|Job Queue| Redis[(Redis / BullMQ)]
    Redis <-->|Queue Workers| Worker[NestJS Background Processor]
    WSGateway <-->|Real-Time Audio & Prompts| OpenAI[OpenAI API GPT-4o / Whisper / TTS]
    Worker <-->|Consolidated Evaluation| OpenAI
```

---

## 🗄️ Database Schema (UML ERD)

```mermaid
erDiagram
    User {
        String id PK
        String email
        String password
        String name
        DateTime createdAt
    }
    
    InterviewSession {
        String id PK
        String userId FK
        String targetRole
        Int difficulty
        Int questionCount
        String mode
        DateTime createdAt
    }
    
    InterviewQuestion {
        String id PK
        String sessionId FK
        String parentQuestionId FK
        Int sequenceNumber
        String category
        String questionText
        String userAnswer
        Int answerDuration
        DateTime createdAt
    }
    
    FeedbackReport {
        String id PK
        String sessionId FK
        Float overallScore
        String hiringRationale
        String status
        String strengths
        String improvements
        String studyRecommendations
        DateTime createdAt
    }

    ResumeAnalysis {
        String id PK
        String userId FK
        String targetRole
        Int atsScore
        Int formattingScore
        Int skillsScore
        Int jobAlignmentScore
        String profileSummary
        Json extractedSkills
        Json experienceAnalysis
        Json atsFormattingIssues
        Json actionableImprovements
        Json targetRoleAlignment
        DateTime createdAt
    }

    User ||--o{ InterviewSession : "starts"
    User ||--o{ ResumeAnalysis : "requests"
    InterviewSession ||--|{ InterviewQuestion : "comprises"
    InterviewSession ||--o| FeedbackReport : "evaluates"
    InterviewQuestion ||--o{ InterviewQuestion : "parent-child self relation (follow-ups)"
```

---

## 💬 Interview Socket Protocol Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Candidate as Next.js Web Client
    participant Gateway as WebSocket Server (NestJS)
    participant OpenAI as OpenAI API GPT-4o
    
    Candidate->>Gateway: connect (auth token, sessionId)
    Gateway-->>Candidate: connection-success (session details)
    Gateway->>OpenAI: Generate First Question
    OpenAI-->>Gateway: streaming-text tokens
    Gateway-->>Candidate: interviewer-message (streaming)
    
    loop Real-time Audio Stream
        Candidate->>Gateway: audio-chunk (binary buffer)
    end
    
    Candidate->>Gateway: user-message (text fallback or manual submit)
    Note over Candidate, Gateway: Audio analysis or silence detection trigger
    
    Gateway->>OpenAI: Process Answer & Generate Follow-up
    OpenAI-->>Gateway: streaming-text tokens
    Gateway-->>Candidate: interviewer-message (streaming follow-up)
    
    Candidate->>Gateway: wrap-session / complete-questions
    Gateway->>Gateway: Push session ID to Redis Evaluation Queue (BullMQ)
    Gateway-->>Candidate: session-ended (report redirect trigger)
```

---

## ✨ Features

### 1. Mock Interview Simulator
* **Configurable Setup**: Start sessions with tailored parameters including Target Role, Difficulty levels (1 to 5), Question Count, and mode (Voice STT/TTS vs. Text Chat).
* **Conversational AI Flow**: Interleaves primary interview questions with counter-questions and follow-ups. The interviewer repeats questions if skipped or unaddressed.
* **Audio Watchdog**: 20-second watchdog response timer with one-click re-submission overlay retry in case of transient network dropouts.
* **Consolidated Scoring**: Multiple follow-up exchanges are grouped under their parent question, and evaluated as a single metric block.
* **Report Exports**: Download professional evaluations in vector-rendered styled PDF Documents, standalone HTML Webpages, or Markdown Files.
* **Session Deletion**: Practice dashboard support to delete old mock interview sessions.

### 2. Resume ATS Optimizer
* **PDF ATS Grading**: Parses resume file uploads and rates them across overall ATS Fit, Role Alignment, Skills Coverage, and Layout formatting.
* **Gaps Analysis**: Extracts key missing keywords to target specific career paths.
* **Suggested Rewrites**: Analyzes experience bullet points and provides actionable before/after impact-driven rewrites.

### 3. Design Aesthetics & Dark/Light Mode
* Clean, premium layouts utilizing dynamic Tailwind CSS theme modifiers.
* LocalStorage persisted dark and light theme toggle support across Dashboard, Interview Room, Feedback Analytics, and Resume Optimizer views.

---

## 🛠️ Installation & Setup

### Prerequisites
* **Node.js**: `v18.x` or later
* **PostgreSQL**: `v14.x` or later
* **Redis**: `v6.x` or later
* **OpenAI API Key** with access to GPT-4o and TTS/Whisper APIs.

### 1. Database Setup
1. Create a PostgreSQL database called `prep_interview`.
2. Configure your Redis instance connection URL.

### 2. Backend Server Configuration
Create `backend/.env`:
```env
PORT=5000
DATABASE_URL="postgresql://user:password@localhost:5432/prep_interview?schema=public"
JWT_SECRET="your-jwt-secure-signing-key"
OPENAI_API_KEY="your-openai-api-key"
REDIS_HOST="localhost"
REDIS_PORT=6379
UPLOAD_DIR="./uploads"
```

Install backend dependencies and run migrations:
```bash
cd backend
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

### 3. Frontend App Configuration
Create `frontend/.env`:
```env
NEXT_PUBLIC_API_URL="http://localhost:5000"
NEXT_PUBLIC_WS_URL="http://localhost:5000"
```

Install frontend dependencies and launch the dev client:
```bash
cd frontend
npm install
npm run dev
```

---

## 💻 Developer Scripts

| Task | Backend Command | Frontend Command |
| :--- | :--- | :--- |
| Install Dependencies | `npm install` | `npm install` |
| Start Dev Server | `npm run dev` | `npm run dev` |
| Build Production Code | `npm run build` | `npm run build` |
| Run Linter Checks | `npm run lint` | `npm run lint` |
| Database Migration | `npx prisma migrate dev` | — |
| Seed Database | `npx prisma db seed` | — |