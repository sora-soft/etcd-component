import {Component, IComponentOptions} from '@sora-soft/framework';
import {Etcd3, IOptions, Lease, Lock, isRecoverableError} from 'etcd3';
import {EtcdError, EtcdErrorCode} from './EtcdError';
import { Policy, ConsecutiveBreaker, ExponentialBackoff } from 'cockatiel';

// tslint:disable-next-line
const pkg = require('../../package.json');

export type EtcdLockCallback<T> = (lock: Lock) => Promise<T>;

export interface IEtcdComponentOptions extends IComponentOptions {
  etcd: IOptions;
  ttl: number;
  prefix: string;
}

class EtcdComponent extends Component {

  protected setOptions(options: IEtcdComponentOptions) {
    this.etcdOptions_ = options;
  }

  protected async connect() {
    this.etcd_ = new Etcd3({
      ...this.etcdOptions_.etcd,
      faultHandling: {
        host: () =>
          Policy.handleWhen(isRecoverableError).circuitBreaker(5_000, new ConsecutiveBreaker(3)),
          global: Policy.handleWhen(isRecoverableError).retry(),
          watchBackoff: new ExponentialBackoff(),
      },
    });
    this.lease_ = this.etcd_.lease(this.etcdOptions_.ttl);
    await this.lease_.grant();
  }

  protected async disconnect() {
    await this.lease_.revoke();
    this.lease_ = null;
    this.etcd_.close();
    this.etcd_ = null;
  }

  async lock<T>(key: string, callback: EtcdLockCallback<T>, ttlSec = 1): Promise<T> {
    if (!this.etcd_)
      throw new EtcdError(EtcdErrorCode.ERR_COMPONENT_NOT_CONNECTED, `ERR_COMPONENT_NOT_CONNECTED, name=${this.name_}`);
    const lock = this.etcd_.lock([this.etcdOptions_.prefix, key].join('/')).ttl(ttlSec);
    return lock.do<T>(async () => {
      return callback(lock);
    });
  }

  get lease() {
    if (!this.lease_)
      throw new EtcdError(EtcdErrorCode.ERR_COMPONENT_NOT_CONNECTED, `ERR_COMPONENT_NOT_CONNECTED, name=${this.name_}`);
    return this.lease_;
  }

  get client() {
    if (!this.etcd_)
      throw new EtcdError(EtcdErrorCode.ERR_COMPONENT_NOT_CONNECTED, `ERR_COMPONENT_NOT_CONNECTED, name=${this.name_}`);
    return this.etcd_;
  }

  get version() {
    return pkg.version;
  }

  private etcd_: Etcd3;
  private etcdOptions_: IEtcdComponentOptions;
  private lease_: Lease;
}

export {EtcdComponent}
