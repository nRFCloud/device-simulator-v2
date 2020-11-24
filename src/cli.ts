#!/usr/bin/env node
import * as program from 'commander';
import { SimulatorConfig, run, error } from './index';

const getConfig = (env: any, args: string[]): SimulatorConfig =>
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
      '1',
    )
    .option('-k, --api-key <apiKey>', 'API key for nRF Cloud', env.API_KEY)
    .option(
      '-h, --api-host <apiHost>',
      'API host for nRF Cloud',
      env.API_HOST ||
        (env.STAGE && env.STAGE !== 'prod'
          ? `https://api.${env.STAGE}.nrfcloud.com`
          : 'https://api.nrfcloud.com'),
    )
    .option(
      '-a, --associate',
      'automatically associate device to account',
      false,
    )
    .option('-v, --verbose', 'output debug info', false)
    .parse(args)
    .opts() as SimulatorConfig;

(async (): Promise<void> => {
  return run(getConfig(process.env, process.argv));
})().catch(err => error(err));
