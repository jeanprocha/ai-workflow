import { IsObject } from 'class-validator';

export class SaveGraphDto {
  @IsObject()
  graph!: unknown;
}
