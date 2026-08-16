export interface IAppError {
  statusCode: number;
  message: string;
  additionalData: string;
  timestamp: string;
  path: string;
}
