import { Injectable, Logger } from '@nestjs/common';
import 'multer';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import {
  buildResumePrompt,
  parseResumeResponse,
  ResumeAnalysisResult,
} from '../ai/prompts/resume.prompt';
import * as fs from 'fs';
import * as path from 'path';
import { PDFParse } from 'pdf-parse';

interface ParsedSkillsJson {
  atsScore?: number;
  formattingScore?: number;
  skillsScore?: number;
  jobAlignmentScore?: number;
  technicalSkills?: string[];
  softSkills?: string[];
  missingSkills?: string[];
  atsFormattingIssues?: string[];
  actionableImprovements?: Array<{
    section: string;
    issue: string;
    recommendation: string;
    exampleBefore?: string;
    exampleAfter?: string;
  }>;
  targetRoleAlignment?: {
    role: string;
    alignmentSummary: string;
    skillsGap: string[];
  };
}

type ParsedRolesJson = Array<{
  company: string;
  role: string;
  duration: string;
  impactEvaluation: string;
}>;

export class MulterFile {
  fieldname!: string;
  originalname!: string;
  encoding!: string;
  mimetype!: string;
  size!: number;
  destination?: string;
  filename?: string;
  path?: string;
  buffer!: Buffer;
}

@Injectable()
export class ResumeService {
  private readonly logger = new Logger(ResumeService.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'resumes');

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadAndAnalyze(
    userId: string,
    file: MulterFile,
    targetRole: string,
  ): Promise<ResumeAnalysisResult> {
    const existing = await this.prisma.resume.findUnique({ where: { userId } });
    if (
      existing &&
      existing.storagePath &&
      fs.existsSync(existing.storagePath)
    ) {
      fs.unlinkSync(existing.storagePath);
    }

    const uniqueFilename = `${userId}-${Date.now()}.pdf`;
    const filePath = path.join(this.uploadDir, uniqueFilename);
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
    fs.writeFileSync(filePath, file.buffer);

    const parser = new PDFParse({ data: file.buffer });
    let parsedText = '';
    try {
      const pdfData = await parser.getText();
      parsedText = pdfData.text || '';
    } finally {
      await parser.destroy();
    }

    const prompt = buildResumePrompt(parsedText, targetRole);
    const llmResponse = await this.aiService.generateEvaluation(prompt);
    const result = parseResumeResponse(llmResponse);

    await this.prisma.resume.upsert({
      where: { userId },
      update: {
        originalName: file.originalname,
        storagePath: filePath,
        mimeType: file.mimetype,
        parsedText,
        parsedSummary: result.profileSummary,
        parsedSkills: {
          atsScore: result.atsScore,
          formattingScore: result.formattingScore,
          skillsScore: result.skillsScore,
          jobAlignmentScore: result.jobAlignmentScore,
          technicalSkills: result.extractedSkills.technical,
          softSkills: result.extractedSkills.soft,
          missingSkills: result.extractedSkills.missing,
          atsFormattingIssues: result.atsFormattingIssues,
          actionableImprovements: result.actionableImprovements,
          targetRoleAlignment: result.targetRoleAlignment,
        },
        parsedRoles: result.experienceAnalysis,
      },
      create: {
        userId,
        originalName: file.originalname,
        storagePath: filePath,
        mimeType: file.mimetype,
        parsedText,
        parsedSummary: result.profileSummary,
        parsedSkills: {
          atsScore: result.atsScore,
          formattingScore: result.formattingScore,
          skillsScore: result.skillsScore,
          jobAlignmentScore: result.jobAlignmentScore,
          technicalSkills: result.extractedSkills.technical,
          softSkills: result.extractedSkills.soft,
          missingSkills: result.extractedSkills.missing,
          atsFormattingIssues: result.atsFormattingIssues,
          actionableImprovements: result.actionableImprovements,
          targetRoleAlignment: result.targetRoleAlignment,
        },
        parsedRoles: result.experienceAnalysis,
      },
    });

    return result;
  }

  async getResumeAnalysis(
    userId: string,
  ): Promise<ResumeAnalysisResult | null> {
    const resume = await this.prisma.resume.findUnique({ where: { userId } });
    if (!resume) return null;

    const skills = (resume.parsedSkills as unknown as ParsedSkillsJson) || {};
    const roles = (resume.parsedRoles as unknown as ParsedRolesJson) || [];

    return {
      atsScore: skills.atsScore || 70,
      formattingScore: skills.formattingScore || 70,
      skillsScore: skills.skillsScore || 70,
      jobAlignmentScore: skills.jobAlignmentScore || 70,
      profileSummary: resume.parsedSummary || '',
      extractedSkills: {
        technical: skills.technicalSkills || [],
        soft: skills.softSkills || [],
        missing: skills.missingSkills || [],
      },
      experienceAnalysis: roles,
      atsFormattingIssues: skills.atsFormattingIssues || [],
      actionableImprovements: skills.actionableImprovements || [],
      targetRoleAlignment: skills.targetRoleAlignment || {
        role: '',
        alignmentSummary: '',
        skillsGap: [],
      },
    };
  }
}
