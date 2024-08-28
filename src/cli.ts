#!/usr/bin/env node
import * as program from 'commander';
import { readFile } from 'fs/promises';
import * as path from 'path';

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

const handleAppType = async (input: any, _: unknown) => {
  if (input === 'mss' || input === 'atv2') {
    return input;
  }

  if (input[0] !== '[' && input[0] !== '{' && !input.includes('.json')) {
    new Log(false).error(
      'Input for appType may only be "mss", "atv2", JSON-encoded object, or path to a json file.',
    );
    process.exit();
  }

  if (input.includes('.json')) {
    //Adding an additional '../' to the input since it's being called from dist and not src
    const file = path.join(__dirname, '../' + input);
    try {
      input = await readFile(file, 'utf8');
    } catch (err) {
      new Log(false).error(`Error opening file: ${err}`);
      process.exit();
    }
  }

  try {
    input = JSON.parse(input);
    if (!validateAppTypeJSONInput(input)) {
      new Log(false).info(
        `Expected input: '{"state":{"reported":{...}, "desired":{...}}}', "desired" is optional.`,
      );
      process.exit();
    }
  } catch (err) {
    new Log(false).error('Error parsing JSON:' + (err as any).message);
    process.exit();
  }
  return input;
};

const handleJobExecution = (input: string, _: unknown) => {
  const validPath = /^[0-5]$/;
  if (!validPath.test(input)) {
    new Log(false).error(
      'Input for jobExecutionPath must be a number between 0 and 5',
    );
    process.exit();
  }
  return input;
};

const handleOnboardingType = (input: string, _: unknown) => {
  if (input === 'preconnect' || input === 'jitp') {
    return input;
  }

  new Log(false).error(
    'Input for onboard must be blank, "jitp" or "preconnect"',
  );
  process.exit();
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
      '-a, --onboard <onboardingType>',
      'Onboard the device with "jitp", or "preconnect"',
      handleOnboardingType,
    )
    .option('-v, --verbose', 'output debug info', false)
    .option(
      '-t, --app-type <appType>',
      'Specifies the shadow to use. For custom shadow, pass a JSON-encoded shadow object or relative path to json file. Otherwise, pass "mss" or "atv2" to automatically generate a conformal shadow',
      handleAppType,
    )
    .option(
      '-p, --job-execution-path <jobExecutionPath>',
      'Specifies an unhappy job execution path for a fota update. View the "Use an unhappy path for FOTA execution" section of the README for more details.',
      handleJobExecution,
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
  config.appType = await config.appType;
  return run(config);
})().catch((err) => new Log(verbose).error(err));
