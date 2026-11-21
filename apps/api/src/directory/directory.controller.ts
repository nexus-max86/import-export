import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { MARKETPLACE_CODES, type PublicCommissioner } from '@konzia/shared';
import { Public } from '../auth/decorators';
import { DirectoryService } from './directory.service';

const UUID = /^[0-9a-f-]{36}$/i;

@Controller('commissioners')
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Public()
  @Get()
  list(
    @Query('ville') cityId?: string,
    @Query('site') marketplace?: string,
  ): Promise<PublicCommissioner[]> {
    if (cityId && !UUID.test(cityId)) throw new BadRequestException('Ville invalide.');
    if (marketplace && !(MARKETPLACE_CODES as string[]).includes(marketplace)) {
      throw new BadRequestException('Site inconnu.');
    }
    return this.directory.list({ cityId, marketplace });
  }

  @Public()
  @Get(':slug')
  get(@Param('slug') slug: string): Promise<PublicCommissioner> {
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw new BadRequestException('Adresse invalide.');
    return this.directory.get(slug);
  }
}
