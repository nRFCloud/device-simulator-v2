#!/usr/bin/env node
import * as program from 'commander';

import { Log } from './models/Log';
import { SimulatorConfig, run } from './index';

function validateAppTypeJSONInput(input: any) {
  if (typeof input.state !== 'object') {
    new Log(false).error(
      'appType custom shadow is missing object value for "state" key',
    );
    return false;
  }

  if (typeof input.state.reported !== 'object') {
    new Log(false).error(
      'appType custom shadow "state" object is missing object value for "reported" key',
    );
    return false;
  }

  return true;
}

const handleAppType = (input: any, _: unknown) => {
  if (input === 'mss' || input === 'atv2') {
    return input;
  }

  if (input[0] !== '[' && input[0] !== '{') {
    new Log(false).error(
      'Input for appType may only be "mss", "atv2", or a JSON-encoded object',
    );
    process.exit();
  }

  try {
    input = JSON.parse(input);
    if (!validateAppTypeJSONInput(input)) {
      new Log(false).info(
        `Expected input: '{"state":{"reported":{<DEVICE_DATA>}}}'`,
      );
      process.exit();
    }
  } catch (err) {
    new Log(false).error('Error parsing JSON:' + (err as any).message);
    process.exit();
  }
  return input;
};

const getConfig = (env: any, args: string[]): SimulatorConfig =>
  program
    .requiredOption(
      '-k, --api-key <apiKey>',
      'API key for nRF Cloud',
      env.API_KEY,
    )
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
      'Comma-delimited list of services to enable. Any of: [gps,acc,temp,device,rsrp,location,log,alert]',
    )
    .option(
      '-f, --app-fw-version <appFwVersion>',
      'Version of the app firmware',
      '1',
    )
    .option(
      '-h, --api-host <apiHost>',
      'API host for nRF Cloud',
      env.API_HOST ? env.API_HOST : 'https://api.nrfcloud.com',
    )
    .option(
      '-a, --associate',
      'automatically associate device to account',
      false,
    )
    .option('-v, --verbose', 'output debug info', false)
    .option(
      '-t, --app-type <appType>',
      'Specifies the shadow to use. For custom shadow, pass a JSON-encoded shadow object. Otherwise, pass "mss" or "atv2" to automatically generate a conformal shadow',
      handleAppType,
    )
    .parse(args)
    .opts() as SimulatorConfig;

let verbose: boolean;

(async (): Promise<void> => {
  const config = getConfig(process.env, process.argv);
  verbose = !!config.verbose;
  const hostSplit = config.apiHost!.split('.');
  let stage = hostSplit.length === 3 ? 'prod' : hostSplit[1];

  // dev is default stage for sub accounts (ie https://api.coha.nrfcloud.com)
  if (['dev', 'beta', 'prod'].includes(stage) === false) {
    stage = 'dev';
  }

  config.stage = stage;
  return run(config);
})().catch((err) => new Log(verbose).error(err));
