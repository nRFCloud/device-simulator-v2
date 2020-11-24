import { device } from 'aws-iot-device-sdk';
import { green, yellow, blue, cyan } from 'colors';

import { KEEP_ALIVE } from '../mqttClient';
import { ISensor } from '../sensors/Sensor';
import { Service } from '../app/services/Service';
import { createService } from '../app/services/createService';

type DeviceListeners = {
  [key: string]: (args: { topic: string; payload: object }) => void;
};

type DeviceTopics = {
  d2c: string,
  jobs: {
    notifyNext: string,
    update: (jobId: string) => {
      _: string,
      accepted: string,
    },
  },
  shadow: {
    update: {
      _: string,
    },
  },
};

export type DeviceConfig = {
  deviceId: string;
  caCert: Buffer | string;
  clientCert: Buffer | string;
  privateKey: Buffer | string;
  endpoint: string;
  appFwVersion: string;
  mqttMessagesPrefix: string;
};

export class NrfDevice {
  public readonly listeners: DeviceListeners;
  public readonly topics: DeviceTopics;
  public readonly id: string;

  private readonly client: device;
  private readonly sensors: Service[];

  constructor(
    deviceId: string,
    mqttMessagesPrefix: string,
    client: device,
    sensors: Map<string, ISensor>,
  ) {
    this.id = deviceId;
    this.listeners = {};
    this.client = client;
    this.topics = {
      d2c: `${mqttMessagesPrefix}d/${deviceId}/d2c`,
      jobs: {
        notifyNext: `$aws/things/${deviceId}/jobs/notify-next`,
        update: (jobId: string) => ({
          _: `$aws/things/${deviceId}/jobs/${jobId}/update`,
          accepted: `$aws/things/${deviceId}/jobs/${jobId}/update/accepted`,
        }),
      },
      shadow: {
        update: {
          _: `$aws/things/${deviceId}/shadow/update`,
        },
      },
    };

    this.sensors = Array.from(sensors.entries()).map(([name, sensor]): Service =>
      createService(name, sensor, this.sendMessage),
    );

    if (this.sensors.length) {
      this.sensors.forEach(service => service.start());
    }
  }

  registerListener(
    topic: string,
    callback: any,
  ): void {
    this.listeners[topic] = callback;
  }

  registerJobListener(
    topic: string,
    callback: (args: { topic: string; payload: any }) => Promise<void>,
  ): void {
    this.listeners[topic] = callback;
  }

  unregisterListener(topic: string): void {
    delete this.listeners[topic];
  }

  async sendMessage(
    timestamp: number,
    payload: object,
  ): Promise<void> {
    const timeStamp = new Date(timestamp).toISOString();
    console.debug(
      `Timestamp ${timeStamp} and messageId not included in message b/c the fw does not support it yet.`,
    );
    await this.publish(this.topics.d2c, payload);
  }

  async subscribe(topic: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.subscribe(topic, undefined, (error: any, granted: any) => {
        if (error) {
          return reject(error);
        }
        console.log(
          green(
            `subscribed to ${yellow(
              granted.map(({ topic }: any) => topic).join(', '),
            )}`,
          ),
        );
        return resolve();
      });
    });
  }

  async publish(topic: string, payload: object): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.publish(topic, JSON.stringify(payload), undefined, (error: any) => {
        if (error) {
          return reject(error);
        }

        console.log(cyan(`> ${topic}`));
        console.log(blue(`>`));
        console.log(blue(JSON.stringify(payload, null, 2)));
        return resolve();
      });
    });
  }

  async updateFwVersion(appVersion: string): Promise<void> {
    await this.publish(this.topics.shadow.update._, {
      state: {
        reported: {
          device: {
            deviceInfo: {
              appVersion,
            },
          },
        },
      },
    });

    console.log(green(`Updated FW version to ${appVersion}`));
  }

  async initShadow(appVersion: string = ''): Promise<void> {
    await this.publish(this.topics.shadow.update._, {
      state: {
        reported: {
          device: {
            serviceInfo: {
              fota_v1: ['APP', 'MODEM'],
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
              modemFirmware: 'mfw_nrf9160_1.1.0',
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