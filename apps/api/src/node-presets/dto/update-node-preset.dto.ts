import { PartialType } from '@nestjs/mapped-types';
import { CreateNodePresetDto } from './create-node-preset.dto';

export class UpdateNodePresetDto extends PartialType(CreateNodePresetDto) {}
