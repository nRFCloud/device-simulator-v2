import { device } from 'aws-iot-device-sdk';
import { AxiosInstance } from 'axios/index';
import axios from 'axios';

import { simulator } from './simulator';
import { Log } from './models/Log';

const cache = require('ez-cache')();
let conn: AxiosInstance;

export const getConn = (
  apiHost: string,
  apiKey: string,
  verbose: boolean,
): AxiosInstance => {
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
      new Log(!!verbose).debug(config);
      return config;
    });
  }

  return conn;
};

export const generateDeviceId = () =>
  `nrfsim-${Math.floor(Math.random() * 1000000000000000000000)}`;

export type CertificatePems = {
  rootCA: string;
  cert: string;
  key: string;
}

export type Certificates = string | CertificatePems;

export type DeviceDefaults = {
  endpoint: string;
  mqttMessagesPrefix: string;
  certs: Certificates;
  tenantId: string;
};

export type SimulatorConfig = {
  certs: Certificates;
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
  onConnect?: (deviceId: string, client?: device) => Promise<void>;
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
  certs,
  apiHost,
  apiKey,
  deviceOwnershipCode,
  verbose,
}: Partial<SimulatorConfig>): Promise<DeviceDefaults> => {
  const conn = getConn(apiHost!, apiKey!, !!verbose);
  const log = new Log(!!verbose);
  const cacheFile = cache.getFilePath(deviceId);
  const cachedDefaults: DeviceDefaults = cache.exists(cacheFile)
    ? await cache.get(cacheFile)
    : {};

  if (!certs) {
    log.debug('Grabbing cert...');
    let defaultJsonCert = cachedDefaults.certs || '';

    if (!defaultJsonCert) {
      log.debug('Fetching cert from device API.\n');
      const { data } = await conn.post(
        `/v1/devices/${deviceId}/certificates`,
        deviceOwnershipCode,
      );

      defaultJsonCert = JSON.stringify(data);
    }

    //defaults.certs = defaultJsonCert;
  }
  
  const defaults: DeviceDefaults = {
    endpoint: endpoint || '',
    mqttMessagesPrefix: mqttMessagesPrefix || '',
    certs: certs || '',
    tenantId: '',
  };

  if (!(endpoint && !mqttMessagesPrefix)) {
    log.debug(`Grabbing mqttEndpoint and messagesPrefix...`);
    let defaultEndpoint = cachedDefaults.endpoint || '',
      defaultMqttMessagesPrefix = cachedDefaults.mqttMessagesPrefix || '';

    if (!(defaultEndpoint && defaultMqttMessagesPrefix)) {
      log.debug('Fetching endpoints from device API.\n');
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

  let tenantId = defaults.mqttMessagesPrefix.split('/')[1];

  if (!tenantId) {
    const { data } = await conn.get(`/v1/account`);
    tenantId = data.mqttTopicPrefix.split('/')[1];
  }

  if (!tenantId) {
    throw new Error(
      `Cannot continue without tenantId! defaults: ${JSON.stringify(defaults)}`,
    );
  }

  defaults.tenantId = tenantId;
  await cache.set(cacheFile, defaults);
  return defaults;
};

export const run = async (config: SimulatorConfig): Promise<void> => {
  const {
    deviceId,
    apiKey,
    apiHost,
    certs,
    endpoint,
    mqttMessagesPrefix,
    deviceOwnershipCode,
    associate,
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

  const defaults: DeviceDefaults = await getDefaults({
    deviceId: config.deviceId,
    deviceOwnershipCode,
    mqttMessagesPrefix,
    certs,
    endpoint,
    apiHost,
    apiKey,
    verbose,
  });

  config.certs = defaults.certs;
  config.mqttMessagesPrefix = defaults.mqttMessagesPrefix;
  config.endpoint = defaults.endpoint;
  config.tenantId = defaults.tenantId;

  log.info(
    log.prettify('CONFIG', [
      ['DEVICE ID', config.deviceId],
      ['DEVICE PIN', config.deviceOwnershipCode!],
      ['API HOST', config.apiHost!],
      ['API KEY', config.apiKey!],
      ['TENANT ID', config.tenantId],
      ['STAGE', config.stage],
    ]),
  );

  log.success('starting simulator...');

  if (associate) {
    config.onConnect = async (deviceId) => {
      log.info(
        `ATTEMPTING TO ASSOCIATE ${config.deviceId} WITH API KEY ${config.apiKey} VIA ${config.apiHost}`,
      );

      // wait to ensure the device is available in AWS IoT so it can be associated
      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
        await associateDevice({
          deviceId,
          deviceOwnershipCode,
          apiHost,
          apiKey,
          verbose,
        });

        log.success('DEVICE ASSOCIATED!');
      } catch (err) {
        log.error(`Failed to associate: ${err}`);
      }
    };
  }

  simulator(config).catch((err) => {
    log.error(err);
  });
};
