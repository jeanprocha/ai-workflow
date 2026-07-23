import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca uma rota como acessivel sem autenticacao (o guard global e ignorado). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
