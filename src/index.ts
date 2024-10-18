import { JobExecutionFailureScenario } from './models/Job';
import { Log } from './models/Log';
import { nrfDevice } from './nrfDevice';
import { RestApiClient } from './restApiClient';
import { createSelfSignedDeviceCertificate, generateDeviceId, getLocallyStoredDeviceCredentials } from './utils';
import path = require('path');
import {
  FakeAccelerometer,
  FakeAlert,
  FakeDevice,
  FakeGnss,
  FakeGps,
  FakeLocation,
  FakeLog,
  FakeRsrp,
  FakeThermometer,
  ISensor,
} from './sensors';

export type DeviceType = 'generic' | 'team';
export type ConnectMode = 'onboard' | 'jitp-associate' | 'jitp-connect-only';
export interface DeviceCredentials {
  caCert: string;
  clientCert: string;
  privateKey: string;
}
export interface DeviceConfig {
  deviceId: string;
  deviceType: DeviceType;
  deviceCredentials: DeviceCredentials;
  mqttEndpoint: string;
  mqttTopicPrefix: string;
  mqttMessagesTopicPrefix: string;
  appFwVersion: string;
  appType: string;
  connectMode: ConnectMode;
  jobExecutionFailureScenario?: JobExecutionFailureScenario;
  sensors: Map<string, ISensor>;
}
export interface SimulatorConfig {
  apiKey: string;
  apiHost: string;
  deviceId: string;
  deviceType: DeviceType;
  connectMode: ConnectMode;
  deviceCredentials: DeviceCredentials;
  services?: string;
  appFwVersion: string;
  appType: string;
  jobExecutionFailureScenario?: JobExecutionFailureScenario;
  verbose: boolean;
}

export const run = async (simConfig: SimulatorConfig): Promise<void> => {
  const {
    deviceType,
    connectMode,
    apiKey,
    apiHost,
    verbose,
  } = simConfig;

  const log = new Log(!!verbose);
  const restApiClient = new RestApiClient(apiHost, apiKey, !!verbose);
  const hostSplit = simConfig.apiHost.split('.');
  const stage = hostSplit.length === 3 ? 'prod' : hostSplit[1];
  const teamData = await restApiClient.fetchTeamInfo();
  const teamId = teamData.team.tenantId;
  const teamName = teamData.team.name;
  const mqttTopicPrefix = `${stage}/${teamId}`;
  const mqttEndpoint = `mqtt${stage === 'prod' ? '' : `.${stage}`}.nrfcloud.com`;
  let deviceId = simConfig.deviceId;
  if (deviceId) {
    simConfig.deviceCredentials = getLocallyStoredDeviceCredentials(deviceId, connectMode, log);
    if (!simConfig.deviceCredentials) {
      throw new Error(`No locally stored device credentials were found for the device id you specified: ${deviceId}.`);
    }
  } else {
    if (deviceType !== 'team') {
      // MQTT Team devices are automatically assigned, by the REST API, a device id formatted as "mqtt-team-<teamId>-<deviceId>".
      // So, skip generating a device id for MQTT Team devices.
      deviceId = generateDeviceId();
    }
  }

  if (!apiKey) {
    throw new Error(
      'Your API key is required. Either pass it as the `-k` argument, or set the API_KEY environment variable.',
    );
  }

  if (simConfig.deviceCredentials) {
    // Check to see if the device is already onboarded by this team. If not, onboard it.
    const res = await restApiClient.fetchDevice(deviceId);
    if (res.status !== 200) {
      // User provided device credentials, but the team does not own the device.
      //
      // JITP device connection mode is handled in the nrfDevice.ts file's connection handler because
      // a JITP device is not onboarded (associated with a team) until it first connects to nRF Cloud.
      //
      // MQTT Team devices are always onboarded, so we can check for onboarding here.
      if (connectMode === 'onboard') {
        await restApiClient.onboardDevice({
          deviceId,
          certificate: simConfig.deviceCredentials.clientCert,
        });
      }
      if (deviceType === 'team') {
        throw new Error(`You provided device credentials for device ${deviceId} of type 'team' (an MQTT Team device),
        but this device could not be found for your team. Please verify the device id and type.`);
      }
    }
  } else {
    // Run simulator with new device credentials.
    if (deviceType === 'team') {
      const { clientId, ...credentials } = await restApiClient.createMqttTeamDevice();
      deviceId = clientId;
      simConfig.deviceCredentials = credentials;
    } else {
      if (connectMode.startsWith('jitp')) {
        simConfig.deviceCredentials = await restApiClient.createJitpCertificate({ deviceId, connectMode });
      } else {
        simConfig.deviceCredentials = createSelfSignedDeviceCertificate({ deviceId, verbose });
        // This will create a new device for the team if the device does not already exist. Otherwise, it will just rotate the certificate.
        await restApiClient.onboardDevice({
          deviceId,
          certificate: simConfig.deviceCredentials.clientCert,
        });
      }
    }
  }

  log.info(
    log.prettify('API CONFIG', [
      ['API HOST', simConfig.apiHost],
      ['MQTT ENDPOINT', mqttEndpoint],
      ['TEAM NAME', teamName],
      ['TEAM ID', teamId],
      ['API KEY', `${apiKey.substring(0, 8)}*******************`],
    ]),
  );

  const sensors = new Map<string, ISensor>();

  if (simConfig.services) {
    simConfig.services.split(',').map((service: string) => {
      const sensorDataFilePath = (filename: string) => path.resolve(__dirname, 'data', 'sensors', filename);

      switch (service) {
        case 'gps':
          sensors.set(
            service,
            new FakeGps(sensorDataFilePath('gps-default.txt'), ['GPGGA'], true),
          );
          break;
        case 'location':
          sensors.set(
            service,
            new FakeLocation(sensorDataFilePath('location.txt'), true, 10000),
          );
          break;
        case 'gnss':
          sensors.set(
            service,
            new FakeGnss(sensorDataFilePath('gnss.json'), true, 10000),
          );
          break;
        case 'acc':
          sensors.set(
            service,
            new FakeAccelerometer(
              sensorDataFilePath('accelerometer.txt'),
              true,
              1000,
            ),
          );
          break;
        case 'temp':
          sensors.set(
            service,
            new FakeThermometer(
              sensorDataFilePath('temperature.txt'),
              true,
              7000,
            ),
          );
          break;
        case 'device':
          sensors.set(
            service,
            new FakeDevice(sensorDataFilePath('device.txt'), true, 5000),
          );
          break;
        case 'rsrp':
          sensors.set(
            service,
            new FakeRsrp(sensorDataFilePath('rsrp.txt'), true, 20000),
          );
          break;
        case 'log':
          sensors.set(
            service,
            new FakeLog(sensorDataFilePath('log.json'), true, 5000),
          );
          break;
        case 'alert':
          sensors.set(
            service,
            new FakeAlert(sensorDataFilePath('alert.json'), true, 10000),
          );
          break;
      }
    });
  }

  const { appFwVersion, appType, jobExecutionFailureScenario, deviceCredentials } = simConfig;
  const deviceConfig: DeviceConfig = {
    deviceCredentials,
    deviceId,
    deviceType,
    mqttEndpoint,
    appFwVersion,
    appType,
    connectMode,
    mqttTopicPrefix,
    mqttMessagesTopicPrefix: `${mqttTopicPrefix}/m`,
    jobExecutionFailureScenario,
    sensors,
  };

  nrfDevice(
    deviceConfig,
    restApiClient,
    log,
  );
};
