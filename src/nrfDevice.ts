import { device } from 'aws-iot-device-sdk';

import { mqttClient } from './mqttClient';
import { ISensor } from './sensors/Sensor';
import { AppMessage } from './app/appMessage';
import { DeviceConfig, NrfDevice } from './models/Device';
import { NrfJobsManager } from './models/Job';
import { Log, Logger } from './models/Log';

export type SendMessage = (timestamp: number, message: AppMessage) => void;

export const nrfdevice = (
  config: DeviceConfig,
  sensors: Map<string, ISensor>,
  onConnect?: (deviceId: string, client: device) => void,
  log: Logger = new Log(true),
) => {
  const {
    deviceId,
    caCert,
    clientCert,
    privateKey,
    endpoint,
    appFwVersion,
    mqttMessagesPrefix,
    stage,
    tenantId,
  } = config;

  let connectedOrReconnected: boolean = false;

  const notifyOfConnection = (eventName: string) => {
    if (!onConnect || connectedOrReconnected) {
      return;
    }

    log.debug(`TRIGGERING ONCONNECT CALLBACK ON "${eventName}"`);
    connectedOrReconnected = true;
    onConnect(deviceId, client);
  };

  log.debug(`connecting to "${endpoint}"...`);

  const client = mqttClient({
    id: deviceId,
    caCert,
    clientCert,
    privateKey,
    endpoint,
  });

  const device = new NrfDevice(
    deviceId,
    mqttMessagesPrefix,
    stage,
    tenantId,
    client,
    sensors,
    log,
  );

  const jobsManager = new NrfJobsManager(device, log);

  client.on('error', (error: any) => {
    log.error(`AWS IoT error ${error.message}`);
  });

  client.on('connect', async () => {
    log.success('connected');
    notifyOfConnection('connect');
    await device.initShadow(appFwVersion);
    await jobsManager.waitForJobs();
  });

  client.on('message', (topic: string, payload: any) => {
    log.incoming(topic, payload || {});
    const p = payload ? JSON.parse(payload.toString()) : {};

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
    log.error('disconnect');
  });

  client.on('reconnect', () => {
    log.success('reconnect');
    notifyOfConnection('reconnect');
  });

  return {
    publish: device.publish,
    subscribe: device.subscribe,
    registerListener: device.registerListener,
    unregisterListener: device.unregisterListener,
    run: async () => {
      await jobsManager.waitForJobs().catch((e) => log.error(e));
    },
  };
};
