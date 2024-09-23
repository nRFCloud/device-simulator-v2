import { device } from 'aws-iot-device-sdk';

import { mqttClient } from './mqttClient';
import { ISensor } from './sensors/Sensor';
import { AppMessage } from './app/appMessage';
import { DeviceConfig, NrfDevice } from './models/Device';
import { NrfJobsManager } from './models/Job';
import { Log, Logger } from './models/Log';
import { AxiosInstance, AxiosResponse } from 'axios';

export type SendMessage = (timestamp: number, message: AppMessage) => void;

export const nrfDevice = (
  config: DeviceConfig,
  sensors: Map<string, ISensor>,
  apiConn: AxiosInstance,
  onConnect?: (deviceId: string, client?: device) => Promise<void>,
  log: Logger = new Log(true),
): any => {
  const {
    deviceId,
    caCert,
    clientCert,
    privateKey,
    endpoint,
    appFwVersion,
    mqttMessagesPrefix,
    appType,
    stage,
    teamId,
    jobExecutionPath,
  } = config;

  let onConnectExecuted = false;
  let onConnectExecuting = false;
  let shadowInitialized = false;
  log.success(`connecting to "${endpoint}"...`);

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
    teamId,
    client,
    sensors,
    log,
  );

  const jobsManager = new NrfJobsManager(device, log, jobExecutionPath);

  const notifyOfConnection = async (eventName: string) => {
    // run callback
    if (onConnect && !onConnectExecuted && !onConnectExecuting) {
      onConnectExecuting = true;
      log.debug(`TRIGGERING ONCONNECT CALLBACK ON "${eventName}"`);
      await onConnect(deviceId);

      // wait for a couple seconds
      await new Promise<void>((resolve) => {
        let halfSecondsElapsed = 1;
        const totalDelay = 10; // 10 half seconds
        log.info('waiting for aws IoT to associate device...');
        const intervalId = setInterval(() => {
          log.debug('.'.repeat(totalDelay - halfSecondsElapsed));
          halfSecondsElapsed++;

          if (halfSecondsElapsed >= totalDelay) {
            clearInterval(intervalId);
            resolve();
          }
        }, 500);
      });
      onConnectExecuted = true;
    }

    if (!onConnect || onConnectExecuted) {
      let deviceAssociated = false;
      let didHaveError = false;

      // listen for jobs, if associated
      log.debug(`checking to see if device ${deviceId} has been onboarded...`);

      await apiConn
        .get(`v1/devices/${deviceId}`)
        .then(async (res: AxiosResponse) => {
          if (res?.data?.teamId === teamId) {
            log.success(
              `confirmed that "${deviceId}" has been onboarded with account "${teamId}"!`,
            );
            deviceAssociated = true;

            //Init shadow
            if (appType && !shadowInitialized) {
              log.info(`Initializing ${deviceId} shadow...`);
              await device.initShadow(appFwVersion, appType);
            }

            shadowInitialized = true;
            log.info('listening for new jobs...');
            await jobsManager.waitForJobs();
          }
        })
        .catch((err) => {
          const code = err?.response?.data?.code;
          if (code !== 40410) {
            log.error(
              `Error getting data for device "${deviceId}". Cannot initialize jobs listener. Error: "${
                err?.response?.data
                  ? JSON.stringify(err.response.data, null, 2)
                  : err
              }"`,
            );
            didHaveError = true;
          }
        })
        .finally(() => {
          if (!deviceAssociated && !didHaveError) {
            log.info(
              `Cannot initialize jobs listener until the device "${deviceId}" is onboarded to your account. You can onboard the device by running "npx @nrfcloud/device-simulator-v2 -k <api key> -d ${deviceId} -a preconnect".`,
            );
          }
        });
    }
  };

  client.on('error', (error: any) => {
    log.error(`AWS IoT error ${error.message}`);
  });

  client.on('connect', async () => {
    log.success('connected');
    await notifyOfConnection('connect');
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

  client.on('reconnect', async () => {
    log.success('reconnect');
    await notifyOfConnection('reconnect');
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
