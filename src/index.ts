import { red, yellow, cyan } from 'colors';
import { AxiosInstance } from 'axios/index';
import { simulator } from './simulator';
import axios from 'axios';

const cache = require('ez-cache')();
let conn: AxiosInstance;

const getConn = (apiHost: string, apiKey: string, verbose: boolean) => {
  if (!conn) {
    // create a connection to the device API
    conn = axios.create({
      baseURL: apiHost,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'text/plain',
      },
    });

    conn.interceptors.request.use((config: any) => {
      debug(config, !!verbose);
      return config;
    });
  }

  return conn;
};

export const error = (message: string) => console.log(red(message));

export const info = (message: string) => console.log(yellow(message));

export const debug = (message: string, verbose: boolean) =>
  verbose && console.log(cyan(message));

export const generateDeviceId = () =>
  `nrfsim-${Math.floor(Math.random() * 1000000000000000000000)}`;

export type DeviceDefaults = {
  endpoint: string;
  mqttMessagesPrefix: string;
  certsResponse: string;
  tenantId: string;
};

export type SimulatorConfig = {
  certsResponse: string;
  endpoint: string;
  appFwVersion: string;
  deviceId: string;
  mqttMessagesPrefix: string;
  stage: string;
  tenantId: string;
  services?: string;
  apiKey?: string;
  apiHost?: string;
  deviceOwnershipCode?: string;
  verbose?: boolean;
  associate?: boolean;
  onConnect?: (deviceId: string, client: any) => void;
};

export const associateDevice = ({
  deviceId,
  deviceOwnershipCode,
  apiHost,
  apiKey,
  verbose,
}: Partial<SimulatorConfig>): Promise<void> =>
  getConn(apiHost as string, apiKey as string, !!verbose).put(
    `/v1/association/${deviceId}`,
    deviceOwnershipCode,
  );

export const getDefaults = async ({
  deviceId,
  endpoint,
  mqttMessagesPrefix,
  certsResponse,
  apiHost,
  apiKey,
  deviceOwnershipCode,
  verbose,
}: Partial<SimulatorConfig>): Promise<DeviceDefaults> => {
  const conn = getConn(apiHost as string, apiKey as string, !!verbose);

  const defaults: DeviceDefaults = {
    endpoint: endpoint || '',
    mqttMessagesPrefix: mqttMessagesPrefix || '',
    certsResponse: certsResponse || '',
    tenantId: '',
  };

  const cacheFile = cache.getFilePath(deviceId);

  const cachedDefaults: DeviceDefaults = cache.exists(cacheFile)
    ? await cache.get(cacheFile)
    : {};

  let tenantId = cachedDefaults.tenantId;

  if (!(endpoint && !mqttMessagesPrefix)) {
    debug(`Grabbing mqttEndpoint and messagesPrefix...`, !!verbose);
    let defaultEndpoint = cachedDefaults.endpoint || '',
      defaultMqttMessagesPrefix = cachedDefaults.mqttMessagesPrefix || '';

    if (!(defaultEndpoint && defaultMqttMessagesPrefix)) {
      debug('Fetching endpoints from device API.\n', !!verbose);
      const { data } = await conn.get(`/v1/account`);
      defaultMqttMessagesPrefix = data.topics.messagesPrefix;
      defaultEndpoint = data.mqttEndpoint;
    }

    if (!endpoint) {
      defaults.endpoint = defaultEndpoint;
    }

    if (!mqttMessagesPrefix) {
      defaults.mqttMessagesPrefix = defaultMqttMessagesPrefix;
    }
  }

  if (!certsResponse) {
    debug('Grabbing cert...', !!verbose);
    let defaultJsonCert = cachedDefaults.certsResponse || '';

    if (!defaultJsonCert) {
      debug('Fetching cert from device API.\n', !!verbose);
      const { data } = await conn.post(
        `/v1/devices/${deviceId}/certificates`,
        deviceOwnershipCode,
      );

      defaultJsonCert = JSON.stringify(data);
    }

    defaults.certsResponse = defaultJsonCert;
  }

  if (!tenantId) {
    tenantId = defaults.mqttMessagesPrefix.split('/')[1];

    if (!tenantId) {
      const { data } = await conn.get(`/v1/account`);
      tenantId = data.mqttTopicPrefix.split('/')[1];
    }

    if (!tenantId) {
      throw new Error(
        `Cannot continue without tenantId! defaults: ${JSON.stringify(
          defaults,
        )}`,
      );
    }

    defaults.tenantId = tenantId;
  }

  await cache.set(cacheFile, defaults);
  return defaults;
};

export const run = async (config: SimulatorConfig): Promise<void> => {
  const {
    deviceId,
    apiKey,
    apiHost,
    certsResponse,
    endpoint,
    mqttMessagesPrefix,
    deviceOwnershipCode,
    associate,
    verbose,
  } = config;

  const divider: string = '********************************************';
  info(divider);

  config.deviceId = deviceId || generateDeviceId();

  // grab the defaults from the API
  if (!(certsResponse && endpoint && mqttMessagesPrefix)) {
    if (!(apiKey && apiHost)) {
      error('apiKey is required');
      return;
    }

    const defaults: DeviceDefaults = await getDefaults({
      deviceId: config.deviceId,
      deviceOwnershipCode,
      mqttMessagesPrefix,
      certsResponse,
      endpoint,
      apiHost,
      apiKey,
      verbose,
    });

    config.certsResponse = defaults.certsResponse;
    config.mqttMessagesPrefix = defaults.mqttMessagesPrefix;
    config.endpoint = defaults.endpoint;
    config.tenantId = defaults.tenantId;
  }

  info(`
DEVICE ID: ${config.deviceId}
DEVICE PIN: ${config.deviceOwnershipCode}

API HOST: ${config.apiHost}
API KEY: ${config.apiKey}
TENANT ID: ${config.tenantId}
STAGE: ${config.stage}

Starting simulator...
${divider}
  `);

  if (associate) {
    config.onConnect = async () => {
      info(
        `ATTEMPTING TO ASSOCIATE ${config.deviceId} WITH API KEY ${config.apiKey} VIA ${config.apiHost}`,
      );

      // Wait to ensure the device is available in AWS IoT so it can be associated
      const sleep2sec = async () =>
        new Promise((resolve) => setTimeout(resolve, 2000));
      await sleep2sec();

      try {
        await associateDevice({
          deviceId: config.deviceId,
          deviceOwnershipCode,

          apiHost,
          apiKey,
          verbose,
        });

        info('DEVICE ASSOCIATED!');
      } catch (err) {
        error(`Failed to associate: ${err}`);
      }
    };
  }

  simulator(config).catch((err) => {
    error(err);
  });
};
