import {Component, IComponentOptions} from '@sora-soft/framework';
import {Etcd3, IOptions, Lease, Lock} from 'etcd3';

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

  async connect() {
    this.etcd_ = new Etcd3(this.etcdOptions_.etcd);
    this.lease_ = this.etcd_.lease(this.etcdOptions_.ttl);
    await this.lease_.grant();
  }

  async disconnect() {
    await this.lease_.revoke();
    this.lease_ = null;
    this.etcd_.close();
    this.etcd_ = null;
  }

  async lock<T>(key: string, callback: EtcdLockCallback<T>, ttlSec = 1): Promise<T> {
    const lock = this.etcd_.lock([this.etcdOptions_.prefix, key].join('/')).ttl(ttlSec);
    return lock.do<T>(async () => {
      return callback(lock);
    });
  }

  get lease() {
    return this.lease_;
  }

  get client() {
    return this.etcd_;
  }

  private etcd_: Etcd3;
  private etcdOptions_: IEtcdComponentOptions;
  private lease_: Lease;
}

export {EtcdComponent}
