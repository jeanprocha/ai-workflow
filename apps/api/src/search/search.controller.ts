import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';

@Controller('search')
@UseGuards(WorkspaceGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@CurrentWorkspace() workspaceId: string, @Query('q') q?: string) {
    return this.searchService.search(workspaceId, q ?? '');
  }
}
