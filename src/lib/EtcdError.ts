import {ExError} from '@sora-soft/framework';

export enum EtcdErrorCode {
  ERR_COMPONENT_NOT_CONNECTED = `ERR_COMPONENT_NOT_CONNECTED`,
}

class EtcdError extends ExError {
  constructor(code: EtcdErrorCode, message: string) {
    super(code, 'EtcdError', message);
    Object.setPrototypeOf(this, EtcdError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}


export {EtcdError}
