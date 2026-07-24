import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

const TRANSPORTS = ['stdio', 'sse', 'http'];

export class ConnectMcpServerDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(TRANSPORTS)
  transport!: 'stdio' | 'sse' | 'http';

  @ValidateIf((dto: ConnectMcpServerDto) => dto.transport === 'stdio')
  @IsString()
  @MinLength(1)
  command?: string;

  @IsOptional()
  args?: string[];

  @IsOptional()
  @IsObject()
  env?: Record<string, string>;

  @ValidateIf((dto: ConnectMcpServerDto) => dto.transport !== 'stdio')
  @IsString()
  @MinLength(1)
  url?: string;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;
}
