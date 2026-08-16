import { EventEmitter } from 'events';
import { AppError } from '../api/errors/app-error.exception';
import { StrictEventEmitter } from 'nest-emitter';

interface AppEvents {
  error: AppError;
}

export type ErrorEmitter = StrictEventEmitter<EventEmitter, AppEvents>;
