import { device } from 'aws-iot-device-sdk';
import { onboardDevice } from '../dist';
import { Log } from './models/Log';
import { CertificateData } from './restApiClient';
import { simulator } from './simulator';
import { createSelfSignedDeviceCertificate } from './utils';

export type SimulatorConfig = {
  mqttEndpoint: string;
  appFwVersion: string;
  deviceId: string;
  certData: CertificateData;
  mqttMessagesPrefix: string;
  stage: string;
  teamId: string;
  appType: string;
  services?: string;
  apiKey?: string;
  apiHost?: string;
  verbose?: boolean;
  jobExecutionPath?: any;
  mqttTeamDevice: boolean;
  onConnect?: (deviceId: string, client?: device) => Promise<void>;
};

export const getTeamInfo = async ({
  deviceId,
  mqttEndpoint,
  mqttMessagesPrefix,
  apiHost,
  apiKey,
  verbose,
}: Partial<SimulatorConfig>): Promise<DeviceDefaults> => {
  const log = new Log(!!verbose);

  const defaults: DeviceDefaults = {
    mqttEndpoint: mqttEndpoint || '',
    mqttMessagesPrefix: mqttMessagesPrefix || '',
    teamId: '',
    certificate: '',
  };

  log.debug(`Fetching mqttEndpoint and messagesPrefix...`);

  log.debug('Fetching MQTT mqttEndpoint and root message topic...\n');
  const { data } = await conn.get(`/v1/account`);
  const { mqttEndpoint: defaultEndpoint, mqttTopicPrefix } = data;
  const defaultMqttMessagesPrefix = mqttTopicPrefix + 'm/';

  if (!mqttEndpoint) {
    defaults.mqttEndpoint = defaultEndpoint;
  }

  if (!mqttMessagesPrefix) {
    defaults.mqttMessagesPrefix = defaultMqttMessagesPrefix;
  }

  let teamId = defaults.mqttMessagesPrefix.split('/')[1];

  if (!teamId) {
    const { data } = await conn.get(`/v1/account`);
    teamId = data.team.tenantId;
  }

  if (!teamId) {
    throw new Error(
      `Cannot determine TeamId.`,
    );
  }

  defaults.teamId = teamId;

  log.debug('Generating self signed device certificates.\n');
};

export const run = async (config: SimulatorConfig): Promise<void> => {
  const {
    deviceId,
    apiKey,
    apiHost,
    mqttEndpoint,
    mqttMessagesPrefix,
    verbose,
  } = config;

  const log = new Log(!!verbose);
  config.deviceId = deviceId || generateDeviceId();

  // grab the defaults from the API
  if (!(apiKey && apiHost)) {
    log.error(
      `ERROR: apiKey: (passed val: "${apiKey}") and apiHost (passed val: "${apiHost}") are required`,
    );
    return;
  }

  config.certData = createSelfSignedDeviceCertificate(deviceId, verbose);

  const defaults: DeviceDefaults = await getDefaults({
    deviceId: config.deviceId,
    mqttMessagesPrefix,
    mqttEndpoint,
    apiHost,
    apiKey,
    verbose,
  });

  config.mqttMessagesPrefix = defaults.mqttMessagesPrefix;
  config.mqttEndpoint = defaults.mqttEndpoint;
  config.teamId = defaults.teamId;

  log.info(
    log.prettify('CONFIG', [
      ['DEVICE ID', config.deviceId],
      ['MQTT TEAM DEVICE', config.mqttTeamDevice.toString()],
      ['API HOST', config.apiHost!],
      ['API KEY', config.apiKey!],
      ['TEAM ID', config.teamId],
    ]),
  );

  log.success('Starting simulator...');

  config.onConnect = async (deviceId) => {
    try {
      await onboardDevice({
        deviceId,
        apiHost,
        apiKey,
        certificate: config.certData.clientCert,
        verbose,
      });

      log.success(`Device ${deviceId} successfully onboarded to nRF Cloud.`);
    } catch (err) {
      log.error(`Device ${deviceId} failed to onboard to nRF Cloud. Error: ${err}`);
    }
  };

  simulator(config).catch((err) => {
    log.error(err);
  });
};
