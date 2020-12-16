import { device } from 'aws-iot-device-sdk';

import { KEEP_ALIVE } from '../mqttClient';
import { ISensor } from '../sensors/Sensor';
import { Service } from '../app/services/Service';
import { createService } from '../app/services/createService';
import { Logger } from './Log';

type DeviceListeners = {
  [key: string]: (args: { topic: string; payload: object }) => void;
};

type DeviceTopics = {
  d2c: string;
  jobs: {
    request: string;
    receive: string;
    update: string;
  };
  shadow: {
    update: {
      _: string;
    };
  };
};

export type DeviceConfig = {
  deviceId: string;
  caCert: Buffer | string;
  clientCert: Buffer | string;
  privateKey: Buffer | string;
  endpoint: string;
  appFwVersion: string;
  mqttMessagesPrefix: string;
  stage: string;
  tenantId: string;
};

export class NrfDevice {
  public readonly listeners: DeviceListeners;
  public readonly topics: DeviceTopics;
  public readonly id: string;

  private readonly client: device;
  private readonly sensors: Service[];
  private readonly log: Logger;

  constructor(
    deviceId: string,
    mqttMessagesPrefix: string,
    stage: string,
    tenantId: string,
    client: device,
    sensors: Map<string, ISensor>,
    log: Logger,
  ) {
    this.log = log;
    this.id = deviceId;
    this.listeners = {};
    this.client = client;
    this.topics = {
      d2c: `${mqttMessagesPrefix}d/${deviceId}/d2c`,
      jobs: {
        request: `${stage}/${tenantId}/${deviceId}/jobs/req`,
        receive: `${stage}/${tenantId}/${deviceId}/jobs/rcv`,
        update: `${stage}/${tenantId}/${deviceId}/jobs/update`,
      },
      shadow: {
        update: {
          _: `$aws/things/${deviceId}/shadow/update`,
        },
      },
    };

    const that = this;

    this.sensors = Array.from(sensors.entries()).map(
      ([name, sensor]): Service =>
        createService(name, sensor, (timestamp, message) =>
          that.sendMessage(timestamp, message),
        ),
    );

    if (this.sensors.length) {
      this.sensors.forEach((service) => service.start());
    }
  }

  registerListener(topic: string, callback: any): void {
    if (this.listeners.topic) {
      this.log.debug(`Already registered listener for "${topic}"`);
      return;
    }

    this.listeners[topic] = callback;
  }

  unregisterListener(topic: string): void {
    delete this.listeners[topic];
  }

  async sendMessage(timestamp: number, payload: object): Promise<void> {
    const timeStamp = new Date(timestamp).toISOString();
    this.log.debug(
      `Timestamp ${timeStamp} and messageId not included in message b/c the fw does not support it yet.`,
    );
    await this.publish(this.topics.d2c, payload);
  }

  async subscribe(topic: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.subscribe(topic, undefined, (error: any, granted: any) => {
        if (error) {
          this.log.error(`ERROR subscribing to "${topic}": ${error}`);
          return reject(error);
        }
        this.log.success(
          `subscribed to "${granted
            .map(({ topic }: any) => topic)
            .join(', ')}"`,
        );
        return resolve();
      });
    });
  }

  async publish(topic: string, payload: object): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.publish(
        topic,
        JSON.stringify(payload),
        undefined,
        (error: any) => {
          if (error) {
            return reject(error);
          }

          this.log.outgoing(topic, payload);
          return resolve();
        },
      );
    });
  }

  async initShadow(appVersion: string = ''): Promise<void> {
    await this.publish(this.topics.shadow.update._, {
      state: {
        reported: {
          device: {
            serviceInfo: {
              fota_v2: ['APP', 'MODEM'],
              ui: [
                'GPS',
                'FLIP',
                'TEMP',
                'HUMID',
                'AIR_PRESS',
                'BUTTON',
                'LIGHT',
              ],
            },
            networkInfo: {
              currentBand: 12,
              supportedBands: '',
              areaCode: 36874,
              mccmnc: '310410',
              ipAddress: '10.160.33.51',
              ueMode: 2,
              cellID: 84485647,
              networkMode: 'LTE-M GPS',
            },
            simInfo: {
              uiccMode: 1,
              iccid: '',
              imsi: '204080813516718',
            },
            deviceInfo: {
              modemFirmware: 'mfw_nrf9160_1.2.2',
              batteryVoltage: 3824,
              imei: '352656100441776',
              board: 'nrf9160_pca20035',
              appVersion,
              appName: 'asset_tracker',
            },
          },
          connection: {
            status: 'connected',
            keepalive: KEEP_ALIVE,
          },
        },
      },
    });
  }
}
