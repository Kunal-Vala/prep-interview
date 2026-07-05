import { IsString, Min, Max, IsIn, IsInt } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  targetRole!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  difficulty!: number;

  @IsString()
  @IsIn(['TEXT', 'VOICE', 'VIDEO_SIM'])
  mode!: 'TEXT' | 'VOICE' | 'VIDEO_SIM';

  @IsInt()
  @Min(3)
  @Max(15)
  questionCount?: number;
}
