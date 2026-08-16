import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export const corsConfig: CorsOptions = {
  origin: process.env.ORIGIN_URL?.includes(',')
    ? process.env.ORIGIN_URL.split(',').map((o) => o.trim())
    : process.env.ORIGIN_URL,
  methods: ['GET', 'PATCH', 'POST', 'PUT', 'OPTIONS', 'DELETE'],
  credentials: true,
};
