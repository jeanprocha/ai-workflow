import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

const EMBEDDING_PROVIDERS = ['openai'];

export class CreateKnowledgeBaseDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(EMBEDDING_PROVIDERS)
  provider?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  credential?: string;

  @IsOptional()
  @IsInt()
  @Min(200)
  @Max(4000)
  chunkSize?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  chunkOverlap?: number;
}
