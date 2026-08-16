import { IRequest } from '@common-request-dto-interfaces/request.interface';
import { IResponse } from '@common-response-dto/response.dto';
import { plainToClass } from 'class-transformer';
import { isDefined } from '@common-utils/is-defined';

/**
 * Converts an object to a query string including nested objects and arrays: key1=value2&key2=value2...
 */
export const objectToQueryString = (o: any): string => {
  const iter = (op: any, path: any) => {
    if (Array.isArray(op)) {
      op.forEach((a) => {
        iter(a, path + '[]');
      });
      return;
    }

    if (op !== null && op !== undefined && typeof op === 'object') {
      Object.keys(op).forEach((k) => {
        iter(op[k], path + '[' + k + ']');
      });
      return;
    }

    if (op !== null && op !== undefined && op !== '') {
      data.push(path + '=' + op);
    }
  };

  const data: any[] = [];
  if (isDefined(o)) {
    Object.keys(o).forEach((k) => {
      iter(o[k], k);
    });
  }

  return data.join('&');
};

export const makeResponse = <T>(
  classType: new (...args: any[]) => T,
  response: IResponse,
): T => plainToClass(classType, response);

export const makeRequest = <T>(
  classType: new (...args: any[]) => T,
  request: IRequest,
): T => plainToClass(classType, request);
