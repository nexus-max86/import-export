import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { FILE_STORAGE, LocalDiskFileStorage, S3FileStorage } from './file-storage';
import { FilesService } from './files.service';

@Global()
@Module({
  providers: [
    FilesService,
    {
      provide: FILE_STORAGE,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.FILE_STORAGE === 's3'
          ? new S3FileStorage(env.S3_BUCKET!, {
              endpoint: env.S3_ENDPOINT!,
              region: env.S3_REGION,
              accessKeyId: env.S3_ACCESS_KEY_ID!,
              secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
            })
          : new LocalDiskFileStorage(env.FILE_STORAGE_DIR),
    },
  ],
  exports: [FilesService],
})
export class FilesModule {}
