import { device } from 'aws-iot-device-sdk';
import { AxiosInstance } from 'axios/index';
import axios from 'axios';
import { execSync } from 'child_process';

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
  appType: string;
  services?: string;
  apiKey?: string;
  apiHost?: string;
  deviceOwnershipCode?: string;
  verbose?: boolean;
  associate?: string;
  jobExecutionPath?: any;
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

export const onboardDevice = ({
	deviceId,
	certsResponse,
	apiHost,
	apiKey,
	verbose,
}: Partial<SimulatorConfig>) => {
	const certificate = JSON.parse(certsResponse as string).certificate;
	return getConn(apiHost as string, apiKey as string, !!verbose).post(
	`v1/devices/${deviceId}`, certificate
)
}

export const getDefaults = async ({
  deviceId,
  endpoint,
  mqttMessagesPrefix,
  certsResponse,
  apiHost,
  apiKey,
  deviceOwnershipCode,
  verbose,
  associate,
}: Partial<SimulatorConfig>): Promise<DeviceDefaults> => {
  const conn = getConn(apiHost!, apiKey!, !!verbose);
  const log = new Log(!!verbose);

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

  if (!(endpoint && mqttMessagesPrefix)) {
    log.debug(`Grabbing mqttEndpoint and messagesPrefix...`);
    let defaultEndpoint = cachedDefaults.endpoint || '',
      defaultMqttMessagesPrefix = cachedDefaults.mqttMessagesPrefix || '';

    if (!(defaultEndpoint && defaultMqttMessagesPrefix)) {
      log.debug('Fetching endpoints from device API.\n');
      const { data } = await conn.get(`/v1/account`);
      defaultMqttMessagesPrefix = data.mqttTopicPrefix + 'm/';
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
    log.debug('Grabbing cert...');
    let defaultJsonCert = cachedDefaults.certsResponse || '';

    // NATE: Add code here
    if (!defaultJsonCert) {
			if (associate === 'jitp') {
				log.debug('Fetching cert from device API.\n');
				const { data } = await conn.post(
					`/v1/devices/${deviceId}/certificates`,
					deviceOwnershipCode,
				);
	
				defaultJsonCert = JSON.stringify(data);
			} else {
				log.debug('Generating self signed device certs.\n');
				const privateKey = execSync(`openssl ecparam -name prime256v1 -genkey`);

				const subject = "/C=NO/ST=Norway/L=Trondheim/O=Nordic Semiconductor/OU=Test Devices"
				const caCert = execSync(`echo "${privateKey}" | openssl req -x509 -extensions v3_ca -new -nodes -key /dev/stdin -sha256 -days 1024 -subj "${subject}"`);
				console.debug('CA Cert', caCert);

				let deviceCSR = execSync(`openssl ecparam -name prime256v1 -genkey`);
				console.debug('ECC', deviceCSR);
				deviceCSR = execSync(`echo "${deviceCSR}" | openssl pkcs8 -topk8 -nocrypt -in /dev/stdin`);
				console.debug('Device PEM', deviceCSR);
				deviceCSR = execSync(`echo "${deviceCSR}" | openssl req -new -key /dev/stdin -subj "${subject}/CN=${deviceId}"`);
				console.debug('Device CSR', deviceCSR);
				deviceCSR = execSync(`openssl x509 -req -in <(echo "${deviceCSR}") -CA <(echo "${caCert}") -CAkey <(echo"${privateKey}") -CAcreateserial -days 10950 -sha256`)
				console.debug('Device Cert', deviceCSR);

				defaultJsonCert = JSON.stringify({privateKey, caCert, certificate: deviceCSR})
			}
    }

    defaults.certsResponse = defaultJsonCert;
  }

  let tenantId = defaults.mqttMessagesPrefix.split('/')[1];

  if (!tenantId) {
    const { data } = await conn.get(`/v1/account`);
    tenantId = data.team.tenantId;
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
    certsResponse,
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

  log.debug(
    log.prettify('INITIAL CONFIG', [
      ['DEVICE ID', config.deviceId],
      ['DEVICE PIN', config.deviceOwnershipCode!],
      ['API HOST', config.apiHost!],
      ['API KEY', config.apiKey!],
      ['TENANT ID', config.tenantId],
      ['STAGE', config.stage],
    ]),
  );

  const defaults: DeviceDefaults = await getDefaults({
    deviceId: config.deviceId,
    deviceOwnershipCode,
    mqttMessagesPrefix,
    certsResponse,
    endpoint,
    apiHost,
    apiKey,
    verbose,
    associate,
  });

  config.certsResponse = defaults.certsResponse;
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
        `ATTEMPTING TO ${associate === 'jitp'? 'ASSOCIATE': 'ONBOARD'} ${config.deviceId} WITH API KEY ${config.apiKey} VIA ${config.apiHost}`,
      );

      // wait to ensure the device is available in AWS IoT so it can be associated
      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
				if (associate === 'jitp') {
					await associateDevice({
						deviceId,
						deviceOwnershipCode,
						apiHost,
						apiKey,
						verbose,
					});
				} else {
					await onboardDevice({deviceId, apiHost, apiKey, certsResponse, verbose})
				}

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
