import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class AiService {
    private readonly client: OpenAI;
    private readonly model: string;
    private readonly logger = new Logger(AiService.name);

    constructor(private config: ConfigService) {
        this.client = new OpenAI({
            apiKey: this.config.get<string>('GITHUB_TOKEN'),
            baseURL: this.config.get<string>('LLM_BASE_URL', 'https://models.inference.ai.azure.com'),
        });
        this.model = this.config.get<string>('LLM_MODEL', 'gpt-4o-mini');
    }

    /**
     * Streams a response from the LLM based on the conversation history.
     * Uses OpenAI-compatible API via GitHub Models.
     * @param history The transcript so far (OpenAI chat format).
     * @param onToken Callback function fired every time a chunk of text arrives.
     */
    async streamInterviewerResponse(
        messages: { role: 'system' | 'user' | 'assistant', content: string }[],
        onToken: (token: string) => void
    ): Promise<string> {
        try {
            this.logger.log('Starting LLM stream...');

            // Prepend system prompt if not already present
            const systemPrompt = {
                role: 'system' as const,
                content: 'You are an expert technical interviewer. Keep responses concise, under 3 sentences. Do not break character. Ask one follow-up question at a time.',
            };

            const fullMessages = messages[0]?.role === 'system'
                ? messages
                : [systemPrompt, ...messages];

            const stream = await this.client.chat.completions.create({
                model: this.model,
                messages: fullMessages,
                stream: true,
            });

            let fullText = '';

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta?.content;
                if (delta) {
                    fullText += delta;
                    onToken(delta);
                }
            }

            this.logger.log('LLM stream complete.');
            return fullText;
        } catch (error) {
            this.logger.error('LLM streaming failed', error);
            throw error;
        }
    }
}
