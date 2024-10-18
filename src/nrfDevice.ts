import { AppMessage } from './app/appMessage';
import { DeviceConfig, DeviceCredentials } from './index';
import { NrfDevice } from './models/Device';
import { NrfJobsManager } from './models/Job';
import { Log, Logger } from './models/Log';
import { mqttClient } from './mqttClient';
import { RestApiClient } from './restApiClient';

export type SendMessage = (timestamp: number, message: AppMessage) => void;

const prepCredentials = (deviceCredentials: DeviceCredentials) => {
  return {
    clientCert: Buffer.from(deviceCredentials.clientCert.replace(/\\n/g, '\n')),
    caCert: Buffer.from(deviceCredentials.caCert.replace(/\\n/g, '\n')),
    privateKey: Buffer.from(deviceCredentials.privateKey.replace(/\\n/g, '\n')),
  };
};

export const nrfDevice = (
  config: DeviceConfig,
  restApiClient: RestApiClient,
  log: Logger = new Log(true),
): any => {
  const {
    deviceId,
    deviceType,
    deviceCredentials,
    mqttEndpoint,
    appFwVersion,
    mqttTopicPrefix,
    mqttMessagesTopicPrefix,
    preventNewJitpDeviceAssociation,
    appType,
    certificateType,
    sensors,
    jobExecutionFailureScenario,
  } = config;

  log.info(
    log.prettify('DEVICE CONFIG', [
      ['DEVICE ID', deviceId],
      ['DEVICE TYPE', deviceType === 'generic' ? 'Generic' : 'MQTT Team'],
      ['CERTIFICATE TYPE', certificateType],
      ['PREVENT NEW JITP DEVICE ASSOCIATION', certificateType === 'jitp' ? preventNewJitpDeviceAssociation.toString() : 'N/A'],
      ['APP FW VERSION', appFwVersion],
      ['APP TYPE', appType || 'None Set'],
      ['SENSORS', Array.from(sensors.keys()).join(', ')],
      ['JOB EXECUTION FAILURE SCENARIO', jobExecutionFailureScenario?.toString() || 'None Set: Normal Operation'],
    ]),
  );

  let onConnectExecuted = false;
  let onConnectExecuting = false;
  let jitpDeviceAssociated = false;
  let jitpDeviceInitialDisconnect = false;
  let shadowInitialized = false;

  const client = mqttClient({
    id: deviceId,
    ...prepCredentials(deviceCredentials),
    mqttEndpoint,
  });

  const device = new NrfDevice(
    deviceId,
    mqttTopicPrefix,
    mqttMessagesTopicPrefix,
    client,
    sensors,
    log,
  );

  const jobsManager = new NrfJobsManager(device, log, jobExecutionFailureScenario);

  const handleConnect = async (eventName: string) => {
    log.info(`Handling MQTT ${eventName} event to ${mqttEndpoint}...`);

    if (!onConnectExecuted && !onConnectExecuting) {
      onConnectExecuting = true;
      if (certificateType === 'jitp' && !preventNewJitpDeviceAssociation && !jitpDeviceAssociated) {
        await restApiClient.associateDevice({ deviceId });
        jitpDeviceAssociated = true;
      }
      onConnectExecuted = true;
    }

    if (onConnectExecuted) {
      if (deviceType === 'team') {
        const topicsTeamAll = `${mqttTopicPrefix}/#`;
        await device.subscribe(`${topicsTeamAll}`);
      } else {
        if (appType && !shadowInitialized) {
          log.info(`Initializing shadow for appType ${appType}...`);
          await device.initShadow(appFwVersion, appType);
        }

        shadowInitialized = true;
        if (!jitpDeviceInitialDisconnect) {
          log.info('Requesting new FOTA jobs by sending an empty message to the /jobs/req topic...');
        }
        await jobsManager.waitForJobs();
      }
    }
  };

  client.on('error', (error: any) => {
    log.error(`AWS IoT error ${error.message}`);
  });

  client.on('connect', async () => {
    await handleConnect('connect');
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
      if (deviceType === 'generic') {
        throw new Error(`No listener registered for topic ${topic}!`);
      }
    }
  });

  client.on('close', () => {
    if (certificateType === 'jitp') {
      jitpDeviceInitialDisconnect = true;
      log.info('Initial disconnect when a JITP device is connecting for the first time. This is expected.');
    } else {
      log.error(`Device disconnected. Make sure device id ${deviceId} matches the one for the certificate.`);
    }
  });

  client.on('reconnect', async () => {
    await handleConnect('reconnect');
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
