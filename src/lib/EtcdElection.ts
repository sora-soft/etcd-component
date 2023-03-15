import {AbortError, AbortErrorCode, Context, Election, Utility} from '@sora-soft/framework';
import {BehaviorSubject} from '@sora-soft/framework/rxjs';
import Etcd from 'etcd3';

class EtcdElection extends Election {
  constructor(etcd: Etcd.Etcd3, name: string) {
    super(name);
    this.etcd_ = etcd;
    this.election_ = this.etcd_.election(name);
  }

  async campaign(id: string, context?: Context) {
    this.startContext_ = new Context(context);
    return new Promise<void>((resolve, reject) => {
      this.startContext_?.signal.addEventListener('abort', () => {
        this.campaign_.removeAllListeners();
        reject(new AbortError(AbortErrorCode.ERR_ABORT));
      });

      this.campaign_ = this.election_.campaign(id);
      this.campaign_.on('elected', () => {
        resolve();
      });

      this.campaign_.on('error', (err) => {
        reject(err);
      });
    });
  }

  async resign() {
    this.startContext_.abort();
    await this.campaign_.resign();
  }

  async leader() {
    return this.election_.leader();
  }

  observer() {
    if (this.leaderSubject_) {
      return this.leaderSubject_;
    }

    this.leaderSubject_ = new BehaviorSubject<string | undefined>(undefined);
    this.election_.observe().then((observe) => {
      observe.on('change', (leader) => {
        this.leaderSubject_.next(leader);
      });
    }).catch(Utility.null);
    return this.leaderSubject_;
  }

  private etcd_: Etcd.Etcd3;
  private election_: Etcd.Election;
  private campaign_: Etcd.Campaign;
  private leaderSubject_: BehaviorSubject<string | undefined>;
  private startContext_: Context;
}

export {EtcdElection};
