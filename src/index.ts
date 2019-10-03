#!/usr/bin/env node
import * as program from 'commander';
import { red } from 'colors';
import * as dotenv from 'dotenv';
import { simulator, SimulatorConfig } from './simulator';
const axios = require('axios');

dotenv.config();

const getConfig = (env: any): SimulatorConfig =>
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
    .option(
      '-d, --device-id <deviceId>',
      'ID of the device',
      env.DEVICE_ID,
    )
    .option(
      '-o, --device-ownership-code <deviceOwnershipCode>',
      'PIN/ownership code of the device',
      env.DEVICE_OWNERSHIP_CODE,
    )
    .option(
      '-k, --api-key <apiKey>',
      'API key for nRF Cloud',
      process.env.API_KEY,
    )
    .option(
      '-k, --api-host <apiHost>',
      'API host for nRF Cloud',
      process.env.API_HOST || 'https://api.dev.nrfcloud.com',
    )
    .option(
      '-s, --services <services>',
      'Comma-delimited list of services to enable. Any of: [gps,acc,temp,device]',
    )
    .option(
      '-a, --app-fw-version <appFwVersion>',
      'Version of the app firmware',
      1,
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
    .parse(process.argv) as unknown as SimulatorConfig;


(async (): Promise<void> => {
  const config: SimulatorConfig = getConfig(process.env);
  const {
    deviceId,
    apiKey,
    apiHost,
    certsResponse,
    endpoint,
    mqttMessagesPrefix,
    deviceOwnershipCode,
  } = config;

  if (!deviceId) {
    console.error(red('A device id is required!'));
    return;
  }

  if (!(
    certsResponse &&
    endpoint &&
    mqttMessagesPrefix
  )) {
    if (!(apiKey && apiHost && deviceOwnershipCode)) {
      console.error('apiKey, apiHost, and deviceOwnershipCode are required to set sensible defaults');
      return;
    }

    const conn = axios.create({
      baseURL: apiHost,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    // const interceptor = conn.interceptors.request.use(config => {
    // 	console.log(config)
    // 	return config;
    // });

    if (!endpoint || !mqttMessagesPrefix) {
      const {
        data: {
          mqttEndpoint,
          topics: { messagesPrefix},
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
      const {data} = await conn.post(`/v1/devices/${deviceId}/certificates`, deviceOwnershipCode);
      config.certsResponse = JSON.stringify(data);
    }
  }

  simulator(config).catch(error => {
    process.stderr.write(`${red(error)}\n`);
  });
})();


