import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CopilotHistoryMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  content!: string;
}

export class CopilotChatDto {
  @IsString()
  @MinLength(1)
  message!: string;

  @IsIn(['openai', 'anthropic', 'gemini', 'ollama'])
  provider!: string;

  @IsString()
  @MinLength(1)
  model!: string;

  @IsOptional()
  @IsString()
  credential?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CopilotHistoryMessageDto)
  history?: CopilotHistoryMessageDto[];
}
