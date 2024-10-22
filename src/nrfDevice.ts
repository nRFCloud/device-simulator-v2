import { AppMessage } from './app/appMessage';
import { DeviceConfig, DeviceCredentials } from './index';
import { NrfDevice } from './models/Device';
import { NrfJobsManager } from './models/Job';
import { Log, Logger } from './models/Log';
import { mqttClient } from './mqttClient';
import { RestApiClient } from './restApiClient';
import { exponentialBackoff } from './utils';

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
    deviceCredentials,
    mqttEndpoint,
    appFwVersion,
    mqttTopicPrefix,
    mqttMessagesTopicPrefix,
    preventAssociation,
    appType,
    certificateType,
    sensors,
    jobExecutionFailureScenario,
  } = config;
  let {
    deviceType,
  } = config;

  if (deviceId.startsWith('mqtt-team-')) {
    deviceType = 'Team';
  }

  log.info(
    log.prettify('DEVICE CONFIG', [
      ['DEVICE ID', deviceId],
      ['DEVICE TYPE', deviceType],
      ['CERTIFICATE TYPE', certificateType],
      ['PREVENT NEW JITP DEVICE ASSOCIATION', certificateType === 'JITP' ? preventAssociation.toString() : 'N/A'],
      ['APP FW VERSION', appFwVersion],
      ['APP TYPE', appType || 'None Set'],
      ['SENSORS', Array.from(sensors.keys()).join(', ') || 'None Set'],
      ['JOB EXECUTION FAILURE SCENARIO', jobExecutionFailureScenario?.toString() || 'None Set (Normal Operations)'],
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
      if (certificateType === 'JITP' && !preventAssociation && !jitpDeviceAssociated) {
        onConnectExecuting = true;
        await exponentialBackoff(async () => restApiClient.associateDevice({ deviceId }), 5, 5000, 30000);
        jitpDeviceAssociated = true;
      }
      onConnectExecuted = true;
    }

    if (onConnectExecuted) {
      if (deviceType === 'Team') {
        const topicsTeamAll = `${mqttTopicPrefix}/#`;
        await device.subscribe(`${topicsTeamAll}`);
      } else {
        if (appType && !shadowInitialized) {
          log.info(`Initializing shadow for appType ${appType}...`);
          await device.initShadow(appFwVersion, appType);
          shadowInitialized = true;
        }

        device.registerListener(device.topics.c2d, async () => {});
        await device.subscribe(device.topics.c2d);

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
    if (topic.lastIndexOf('/c2d') > 0) {
      topic = device.topics.c2d;
    }

    if (device.listeners[topic]) {
      device.listeners[topic]({
        topic,
        payload: p,
      });
    } else {
      if (deviceType === 'Generic') {
        throw new Error(`No listener registered for topic ${topic}!`);
      }
    }
  });

  client.on('close', () => {
    if (certificateType === 'JITP') {
      jitpDeviceInitialDisconnect = true;
      log.info(
        'Device disconnected. This behavior is expected for new JITP devices when they present their certificate to the broker and are disconnected until the certificate is registered.',
      );
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
