import { device } from 'aws-iot-device-sdk';
import { green, yellow, magenta, cyan } from 'colors';

import { mqttClient } from './mqttClient';
import { ISensor } from './sensors/Sensor';
import { AppMessage } from './app/appMessage';
import { DeviceConfig, NrfDevice } from './models/Device';
import { NrfJobsManager } from './models/Job';

export type SendMessage = (timestamp: number, message: AppMessage) => void;

export const nrfdevice = (
  config: DeviceConfig,
  sensors: Map<string, ISensor>,
  onConnect?: (deviceId: string, client: device) => void,
) => {
  const {
    deviceId,
    caCert,
    clientCert,
    privateKey,
    endpoint,
    appFwVersion,
    mqttMessagesPrefix,
  } = config;

  let connectedOrReconnected: boolean = false;

  const notifyOfConnection = (eventName: string) => {
    if (!onConnect || connectedOrReconnected) {
      return;
    }

    console.log(yellow(`TRIGGERING ONCONNECT CALLBACK ON "${eventName}"`));
    connectedOrReconnected = true;
    onConnect(deviceId, client);
  };

  console.log(cyan(`connecting to ${yellow(endpoint)}...`));

  const client = mqttClient({
    id: deviceId,
    caCert,
    clientCert,
    privateKey,
    endpoint,
  });

  const device = new NrfDevice(deviceId, mqttMessagesPrefix, client, sensors);

  const jobsManager = new NrfJobsManager(device);

  console.log(
    yellow(
      JSON.stringify(
        {
          deviceId,
          endpoint,
          region: endpoint.split('.')[2],
          topics: device.topics,
          appFwVersion: parseInt(appFwVersion, 10),
          mqttMessagesPrefix,
        },
        null,
        2,
      ),
    ),
  );

  client.on('error', (error: any) => {
    console.error(`AWS IoT error ${error.message}`);
  });

  client.on('connect', async () => {
    console.log(green('connected'));
    notifyOfConnection('connect');
    await device.initShadow(appFwVersion);
    await jobsManager.waitForJobs();
  });

  client.on('message', (topic: string, payload: any) => {
    console.log(magenta(`< ${topic}`));
    const p = payload ? JSON.parse(payload.toString()) : {};

    console.log(magenta(`<`));
    console.log(magenta(JSON.stringify(p, null, 2)));
    if (device.listeners[topic]) {
      device.listeners[topic]({
        topic,
        payload: p,
      });
    } else {
      throw new Error(`No listener registered for topic ${topic}!`);
    }
  });

  client.on('close', () => {
    console.error('disconnect');
  });

  client.on('reconnect', () => {
    console.log(magenta('reconnect'));
    notifyOfConnection('reconnect');
  });

  return {
    publish: device.publish,
    subscribe: device.subscribe,
    registerListener: device.registerListener,
    unregisterListener: device.unregisterListener,
    run: async (args: { appFwVersion: string }) => {
      await device.updateFwVersion(args.appFwVersion);
      await jobsManager.waitForJobs().catch(e => console.error(e));
    },
  };
};
