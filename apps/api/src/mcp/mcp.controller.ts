import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { McpService } from './mcp.service';
import { ConnectMcpServerDto } from './dto/connect-mcp-server.dto';
import { CallMcpToolDto } from './dto/call-mcp-tool.dto';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';

@Controller('mcp')
@UseGuards(WorkspaceGuard)
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Get('servers')
  list(@CurrentWorkspace() workspaceId: string) {
    return this.mcpService.list(workspaceId);
  }

  @Post('servers')
  connect(
    @CurrentWorkspace() workspaceId: string,
    @Body() dto: ConnectMcpServerDto,
  ) {
    return this.mcpService.connect(workspaceId, dto);
  }

  @Post('servers/:id/reconnect')
  reconnect(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.mcpService.reconnect(workspaceId, id);
  }

  @Post('servers/:id/disconnect')
  disconnect(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.mcpService.disconnect(workspaceId, id);
  }

  @Delete('servers/:id')
  remove(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.mcpService.remove(workspaceId, id);
  }

  @Post('servers/:id/call')
  callTool(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: CallMcpToolDto,
  ) {
    return this.mcpService.callTool(
      workspaceId,
      id,
      dto.toolName,
      dto.args ?? {},
    );
  }
}
