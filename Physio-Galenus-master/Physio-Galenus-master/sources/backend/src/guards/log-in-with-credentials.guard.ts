import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LogInWithCredentialsGuard extends AuthGuard('local') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check the email and the password
    await super.canActivate(context);

    // Initialize the session
    const request = context.switchToHttp().getRequest();
    await super.logIn(request);

    // If no exceptions were thrown, allow the access to the route
    return true;
  }
}
