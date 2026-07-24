import { IsInt, Min } from 'class-validator';

export class ApplySuggestionDto {
  @IsInt()
  @Min(0)
  suggestionIndex!: number;
}
