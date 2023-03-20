import {Component, ExError, IComponentOptions, IEventEmitter, Runtime, Time} from '@sora-soft/framework';
import {Etcd3, IOptions, Lease, Lock, isRecoverableError} from 'etcd3';
import {EtcdError, EtcdErrorCode} from './EtcdError.js';
import {Policy, ConsecutiveBreaker, ExponentialBackoff} from 'cockatiel';
import {EventEmitter} from 'stream';
import {EtcdEvent, IEtcdEvent} from './EtcdEvent.js';
import {readFile} from 'fs/promises';
import {AssertType, ValidateClass} from '@sora-soft/type-guard';

const pkg = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), {encoding: 'utf-8'})
) as {version: string};

export type EtcdLockCallback<T> = (lock: Lock) => Promise<T>;

export interface IEtcdComponentOptions extends IComponentOptions {
  etcd: IOptions;
  ttl: number;
  prefix: string;
}

@ValidateClass()
class EtcdComponent extends Component {

  protected setOptions(@AssertType() options: IEtcdComponentOptions) {
    this.etcdOptions_ = options;
    this.emitter_ = new EventEmitter();
  }

  protected async connect() {
    this.etcd_ = new Etcd3({
      ...this.etcdOptions_.etcd,
      faultHandling: {
        host: () =>
          Policy.handleWhen(isRecoverableError).circuitBreaker(5000, new ConsecutiveBreaker(3)),
        global: Policy.handleWhen(isRecoverableError).retry(),
        watchBackoff: new ExponentialBackoff(),
      },
    });

    await this.grantLease();
  }

  async reconnect(err: Error) {
    await Time.timeout(1000);
    Runtime.frameLogger.info(`component.${this.name}`, {event: 'start-grant-lease'});
    await this.grantLease().catch(async (e: ExError) => {
      Runtime.frameLogger.error(`component.${this.name}`, e, {event: 'reconnect-grant-lease-error'});
      await this.reconnect(err);
    });

    if (!this.lease_) {
      return;
    }
    this.emitter_.emit(EtcdEvent.LeaseReconnect, this.lease_, err);
  }

  async grantLease() {
    if (!this.etcd_)
      throw new EtcdError(EtcdErrorCode.ERR_COMPONENT_NOT_CONNECTED, `ERR_COMPONENT_NOT_CONNECTED, name=${this.name_}`);

    this.lease_ = this.etcd_.lease(this.etcdOptions_.ttl);
    await this.lease_.grant();
    this.lease_.on('lost', async (err: ExError) => {
      Runtime.frameLogger.warn(`component.${this.name}`, {event: 'lease-lost', err});
      await this.reconnect(err);
    });
  }

  protected async disconnect() {
    if (this.lease_)
      await this.lease_.revoke();
    this.lease_ = null;
    if (this.etcd_)
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

  get emitter() {
    return this.emitter_;
  }

  private etcd_: Etcd3 | null;
  private etcdOptions_: IEtcdComponentOptions;
  private lease_: Lease | null;
  private emitter_: IEventEmitter<IEtcdEvent>;
}

export {EtcdComponent};
