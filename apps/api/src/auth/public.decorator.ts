import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'pypr:isPublic';

/** Opts a route out of the global auth guard. Every other route needs a valid session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
