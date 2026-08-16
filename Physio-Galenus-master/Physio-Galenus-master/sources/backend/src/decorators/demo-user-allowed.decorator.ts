import { SetMetadata } from '@nestjs/common';

export const DEMO_USER_ALLOWED_KEY = 'demoUserAllowed';

export const DemoUserAllowed = () => SetMetadata(DEMO_USER_ALLOWED_KEY, true);
