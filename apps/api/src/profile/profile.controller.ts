import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  AddressSchema,
  UpdateProfileSchema,
  type AddressInfo,
  type AddressInput,
  type ProfileInfo,
  type UpdateProfileInput,
} from '@konzia/shared';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { ZodBody } from '../common/zod-body.pipe';
import { ProfileService } from './profile.service';

@Controller('me')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get('profile')
  get(@Auth() auth: AuthContext): Promise<ProfileInfo> {
    return this.profile.get(auth.userId);
  }

  @Put('profile')
  update(
    @Auth() auth: AuthContext,
    @Body(new ZodBody(UpdateProfileSchema)) body: UpdateProfileInput,
  ): Promise<ProfileInfo> {
    return this.profile.update(auth.userId, body);
  }

  @Get('addresses')
  list(@Auth() auth: AuthContext): Promise<AddressInfo[]> {
    return this.profile.listAddresses(auth.userId);
  }

  @Post('addresses')
  create(
    @Auth() auth: AuthContext,
    @Body(new ZodBody(AddressSchema)) body: AddressInput,
  ): Promise<AddressInfo> {
    return this.profile.createAddress(auth.userId, body);
  }

  @Patch('addresses/:id')
  updateAddress(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(AddressSchema)) body: AddressInput,
  ): Promise<AddressInfo> {
    return this.profile.updateAddress(auth.userId, id, body);
  }

  @Delete('addresses/:id')
  @HttpCode(204)
  remove(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.profile.deleteAddress(auth.userId, id);
  }
}
