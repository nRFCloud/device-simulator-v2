import { device } from 'aws-iot-device-sdk';

import { AppMessage } from '../app/appMessage';
import { createService } from '../app/services/createService';
import { Service } from '../app/services/Service';
import { KEEP_ALIVE } from '../mqttClient';
import { ISensor } from '../sensors/Sensor';
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
  appType: string;
  mqttMessagesPrefix: string;
  stage: string;
  teamId: string;
  jobExecutionPath: any;
  mqttTeamDevice: boolean;
};

export class NrfDevice {
  public readonly listeners: DeviceListeners;
  public readonly topics: DeviceTopics;
  public readonly id: string;
  public readonly mqttTeamDevice: boolean;

  private readonly client: device;
  private readonly sensors: Service[];
  private readonly log: Logger;

  constructor(
    deviceId: string,
    mqttMessagesPrefix: string,
    stage: string,
    teamId: string,
    client: device,
    sensors: Map<string, ISensor>,
    log: Logger,
    mqttTeamDevice: boolean,
  ) {
    this.log = log;
    this.id = deviceId;
    this.listeners = {};
    this.mqttTeamDevice = mqttTeamDevice;
    this.client = client;
    this.topics = {
      d2c: `${mqttMessagesPrefix}d/${deviceId}/d2c`,
      jobs: {
        request: `${stage}/${teamId}/${deviceId}/jobs/req`,
        receive: `${stage}/${teamId}/${deviceId}/jobs/rcv`,
        update: `${stage}/${teamId}/${deviceId}/jobs/update`,
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
        createService(name, sensor, (timestamp, message) => that.sendMessage(timestamp, message)),
    );

    if (this.sensors.length) {
      this.sensors.forEach((service) => service.start());
    }
  }

  registerListener(topic: string, callback: any): void {
    if (this.listeners.topic !== undefined) {
      this.log.debug(`Already registered listener for "${topic}"`);
      return;
    }

    this.listeners[topic] = callback;
  }

  unregisterListener(topic: string): void {
    delete this.listeners[topic];
  }

  async sendMessage(ts: number, payload: AppMessage): Promise<void> {
    const _payload = {
      ...payload,
      ts,
    };
    this.log.debug(
      `${new Date(ts).toISOString()} >>> attempting to publish payload ${JSON.stringify(_payload, null, 2)}`,
    );
    await this.publish(this.topics.d2c, _payload);
  }

  async subscribe(topic: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.subscribe(topic, undefined, (error: any, granted: any) => {
        if (error) {
          this.log.error(`ERROR subscribing to "${topic}": ${error}`);
          return reject(error);
        }
        this.log.success(
          `subscribed to "${
            granted
              .map(({ topic }: any) => topic)
              .join(', ')
          }"`,
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
        {
          qos: 1,
        },
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

  // Create a shadow for either Asset Tracker v2 (atv2) or Multi-Service Sample (mss), or the input from JSON
  async initShadow(appVersion: string = '', appType: string | object): Promise<void> {
    let shadow = appType;
    if (shadow === 'atv2' || shadow === 'mss') {
      shadow = {
        state: {
          reported: {
            connection: {
              status: 'connected',
              keepalive: KEEP_ALIVE,
            },
            control: {
              alertsEn: true,
              logLvl: 3,
            },
            ...(shadow === 'atv2' && {
              config: {
                activeMode: true,
                locationTimeout: 300,
                activeWaitTime: 300,
                movementResolution: 120,
                movementTimeout: 3600,
                accThreshAct: 4,
                accThreshInact: 4,
                accTimeoutInact: 60,
                nod: [],
              },
            }),
            device: {
              deviceInfo: {
                appVersion: appVersion ?? '1.0.0',
                batteryVoltage: 5191,
                appName: shadow === 'mss' ? 'nrf_cloud_multi_service' : 'asset_tracker_v2',
                imei: '358299840010349',
                board: 'nrf9161dk_nrf9161',
                sdkVer: 'v2.6.0-571-gf927cd6b1473',
                zephyrVer: 'v3.5.99-ncs1-4957-g54b4e400ed8f',
                hwVer: 'nRF9161 LACA ADA',
              },
              networkInfo: {
                supportedBands: '(1,2,3,4,5,8,12,13,18,19,20,25,26,28,66,85)',
                networkMode: 'LTE-M GPS',
                ipAddress: '10.160.33.51',
                ueMode: 2,
                rsrp: -58,
              },
              simInfo: {
                uiccMode: 1,
                iccid: '',
                imsi: '204080813516718',
              },
              serviceInfo: {
                fota_v2: shadow === 'mss' ? ['MODEM', 'APP'] : ['BOOT', 'MODEM', 'APP'],
              },
              connectionInfo: {
                protocol: 'MQTT',
                method: 'LTE',
              },
            },
          },
        },
      };
    }
    // @ts-ignore, Adding in a flag that we check for when we want to see if the shadow was generated by the simulator. Won't appear in the case of no shadow.
    shadow.state.reported.simulator = true;
    await this.publish(this.topics.shadow.update._, shadow as object);
  }
}
