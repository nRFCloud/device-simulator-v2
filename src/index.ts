#!/usr/bin/env node
import * as program from 'commander';
import { red, yellow, cyan } from 'colors';
import { simulator, SimulatorConfig } from './simulator';
const axios = require('axios');
const cache = require('ez-cache')();

const getConfig = (args: any, env: any): SimulatorConfig =>
  program
    .option(
      '-c, --certs-response <certsResponse>',
      'JSON returned by call to the Device API endpoint: POST /devices/{deviceid}/certificates',
      env.CERTS_RESPONSE,
    )
    .option(
      '-e, --endpoint <endpoint>',
      'AWS IoT MQTT endpoint',
      env.MQTT_ENDPOINT,
    )
    .option('-d, --device-id <deviceId>', 'ID of the device', env.DEVICE_ID)
    .option(
      '-o, --device-ownership-code <deviceOwnershipCode>',
      'PIN/ownership code of the device',
      env.DEVICE_OWNERSHIP_CODE || '123456',
    )
    .option(
      '-m, --mqtt-messages-prefix <mqttMessagesPrefix>',
      'The prefix for the MQTT unique to this tenant for sending and receiving device messages',
      env.MQTT_MESSAGES_PREFIX,
    )
    .option(
      '-s, --services <services>',
      'Comma-delimited list of services to enable. Any of: [gps,acc,temp,device]',
    )
    .option(
      '-f, --app-fw-version <appFwVersion>',
      'Version of the app firmware',
      1,
    )
    .option(
      '-k, --api-key <apiKey>',
      'API key for nRF Cloud',
      process.env.API_KEY,
    )
    .option(
      '-h, --api-host <apiHost>',
      'API host for nRF Cloud',
      process.env.API_HOST || 'https://api.dev.nrfcloud.com',
    )
    .option(
      '-a, --associate',
      'automatically associate device to account',
      false,
    )
    .option('-v, --verbose', 'output debug info', false)
    .parse(args)
    .opts() as SimulatorConfig;

// i don't understand this 'no-floating-promises' rule.
// so I'm using the javascript 'void' operator:  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/void
// ¯\_(ツ)_/¯
(async (): Promise<void> => {
  const config: SimulatorConfig = getConfig(process.argv, process.env);

  const {
    deviceId,
    apiKey,
    apiHost,
    certsResponse,
    endpoint,
    mqttMessagesPrefix,
    deviceOwnershipCode,
    verbose,
    associate,
  } = config;

  const debug = (message: string) => verbose && console.log(cyan(message));
  const info = (message: string) => console.log(yellow(message));
  const error = (message: string) => console.log(red(message));

  const divider: string = '********************************************';
  info(divider);

  if (!deviceId) {
    config.deviceId = `nrfsim-${Math.floor(
      Math.random() * 1000000000000000000000,
    )}`;
  }

  // create a connection to the device API
  const conn = axios.create({
    baseURL: apiHost,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  conn.interceptors.request.use((config: any) => {
    debug(config);
    return config;
  });

  // grab the defaults from the API
  if (!(certsResponse && endpoint && mqttMessagesPrefix)) {
    if (!(apiKey && apiHost && deviceOwnershipCode)) {
      error(
        'apiKey, apiHost, and deviceOwnershipCode are required to set sensible defaults',
      );
      return;
    }

    if (!endpoint || !mqttMessagesPrefix) {
      info(`Grabbing mqttEndpoint and messagesPrefix...`);

      const {
        data: {
          mqttEndpoint,
          topics: { messagesPrefix },
        },
      } = await conn.get(`/v1/account`);

      if (!endpoint) {
        config.endpoint = mqttEndpoint;
      }

      if (!mqttMessagesPrefix) {
        config.mqttMessagesPrefix = messagesPrefix;
      }
    }

    if (!certsResponse) {
      info('Grabbing cert...');
      let jsonCert: string;

      // check the cache for a cert
      const cacheFile = cache.getFilePath(config.deviceId);

      if (cache.exists(cacheFile)) {
        jsonCert = await cache.get(cacheFile);
        info(`Grabbed cert from ${cacheFile}`);
      } else {
        const { data } = await conn.post(
          `/v1/devices/${config.deviceId}/certificates`,
          deviceOwnershipCode,
        );

        jsonCert = data;
        await cache.set(cacheFile, jsonCert);
      }

      config.certsResponse = JSON.stringify(jsonCert);
    }
  }

  info(`
DEVICE ID: ${config.deviceId}
DEVICE PIN: ${config.deviceOwnershipCode}

API HOST: ${config.apiHost}
API KEY: ${config.apiKey}

Starting simulator...
${divider}
  `);

  if (associate) {
    config.onConnect = async () => {
      info(`ASSOCIATING ${config.deviceId} WITH ACCOUNT #${config.apiKey}`);

      try {
        await conn.put(
          `/v1/association/${config.deviceId}`,
          config.deviceOwnershipCode,
        );

        info('DEVICE ASSOCIATED!');
      } catch (err) {
        error(`Failed to associate: ${err}`);
      }
    };
  }

  simulator(config).catch(error => {
    process.stderr.write(`${red(error)}\n`);
  });
})().catch(_ => undefined);
