import { JobExecutionFailureScenario } from './models/Job';
import { Log } from './models/Log';
import { nrfDevice } from './nrfDevice';
import { RestApiClient } from './restApiClient';
import {
  createSelfSignedDeviceCertificate,
  formatCredentialsFilePath,
  generateDeviceId,
  getLocallyStoredDeviceCredentials,
} from './utils';
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

export type DeviceType = 'Generic' | 'Team';
export type CertificateType = 'Self-Signed' | 'JITP' | 'Non-JITP (AWS-Signed)';
export interface DeviceCredentials {
  caCert: string;
  clientCert: string;
  privateKey: string;
}
interface ConfigCommon {
  deviceId: string;
  deviceType: DeviceType;
  certificateType: CertificateType;
  deviceCredentials?: DeviceCredentials;
  appFwVersion: string;
  appType: string;
  preventAssociation: boolean;
  jobExecutionFailureScenario?: JobExecutionFailureScenario;
  verbose: boolean;
}
export interface DeviceConfig extends ConfigCommon {
  deviceCredentials: DeviceCredentials;
  mqttEndpoint: string;
  mqttTopicPrefix: string;
  mqttMessagesTopicPrefix: string;
  sensors: Map<string, ISensor>;
}
export interface SimulatorConfig extends ConfigCommon {
  apiKey: string;
  apiHost: string;
  sensors?: string[];
}

export const run = async (simConfig: SimulatorConfig): Promise<void> => {
  const {
    deviceType,
    certificateType,
    preventAssociation,
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
    simConfig.deviceCredentials = getLocallyStoredDeviceCredentials(deviceId, log);
    if (!simConfig.deviceCredentials) {
      log.info(
        `You set device ID '${deviceId}' but credentials could not be found at their expected location: ${
          formatCredentialsFilePath(deviceId)
        }. New credentials will be auto-generated.`,
      );
    }
  } else {
    if (deviceType !== 'Team') {
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
      // User provided device credentials, but the device was not found for this team.
      //
      // JITP device connection mode is handled in the nrfDevice.ts file's connection handler because
      // a JITP device is not onboarded (associated with a team) until it first connects to nRF Cloud.
      //
      // MQTT Team devices are always onboarded, so we can check for onboarding here.
      if (certificateType === 'Self-Signed') {
        await restApiClient.onboardDevice({
          deviceId,
          certificate: simConfig.deviceCredentials.clientCert,
        });
      }
      if (deviceType === 'Team') {
        throw new Error(
          `You provided device credentials for device ID '${deviceId}' of type 'Team' (an MQTT Team device),
        but this device could not be found for your team. Please verify the device id and type.`,
        );
      }
    } else if (preventAssociation) {
      log.info(
        `Device ID '${deviceId}' is already associated with team '${teamName}' (${teamId}). The "--prevent-association" flag is ignored.`,
      );
    }
  } else {
    // Run simulator with new device credentials.
    if (deviceType === 'Team') {
      const { clientId, ...credentials } = await restApiClient.createMqttTeamDevice();
      deviceId = clientId;
      simConfig.deviceCredentials = credentials;
    } else {
      if (certificateType === 'JITP') {
        simConfig.deviceCredentials = await restApiClient.createJitpCertificate({ deviceId, certificateType });
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

  if (simConfig.sensors) {
    simConfig.sensors.map((service: string) => {
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
    certificateType,
    preventAssociation,
    mqttTopicPrefix,
    mqttMessagesTopicPrefix: `${mqttTopicPrefix}/m`,
    jobExecutionFailureScenario,
    sensors,
    verbose,
  };

  nrfDevice(
    deviceConfig,
    restApiClient,
    log,
  );
};
