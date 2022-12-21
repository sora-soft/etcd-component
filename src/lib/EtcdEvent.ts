import {Lease} from 'etcd3';

export enum EtcdEvent {
  LeaseReconnect = 'lease-reconnect'
}

export interface IEtcdEvent {
  [EtcdEvent.LeaseReconnect]: (lease: Lease, etcd: Error) => void;
}
