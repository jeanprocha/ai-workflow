import { IsIn } from 'class-validator';

export class ResolveSuggestionDto {
  @IsIn(['accepted', 'rejected'])
  status!: 'accepted' | 'rejected';
}
