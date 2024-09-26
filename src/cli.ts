#!/usr/bin/env node
import * as program from 'commander';
import { readFile } from 'fs/promises';
import * as path from 'path';

import { run, SimulatorConfig } from './index';
import { Log } from './models/Log';

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
    // Adding an additional '../' to the input since it's being called from dist and not src
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
    // tslint:disable-next-line: no-unnecessary-type-assertion
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

const getConfig = (env: any, args: string[]): SimulatorConfig =>
  program
    .requiredOption(
      '-k, --api-key <apiKey>',
      'nRF Cloud REST API Key',
      env.API_KEY,
    )
    .option(
      '-h, --api-host <apiHost>',
      'nRF Cloud API Host',
      env.API_HOST ? env.API_HOST : 'https://api.nrfcloud.com',
    )
    .option(
      '-e, --mqttEndpoint <mqttEndpoint>',
      'nRF Cloud MQTT Endpoint',
      env.MQTT_ENDPOINT ? env.MQTT_ENDPOINT : 'mqtt.nrfcloud.com',
    )
    .option(
      '-d, --device-id <deviceId>',
      'ID of the device. If not set after onboarding a device, a new device is created.',
      env.DEVICE_ID,
    )
    .option(
      '-s, --services <services>',
      'Comma-delimited list of services to enable. Any of: [gps,gnss,acc,temp,device,rsrp,location,log,alert]',
    )
    .option(
      '-f, --app-fw-version <appFwVersion>',
      'Version of the app firmware',
      '1',
    )
    .option(
      '-t, --app-type <appType>',
      'Specifies the shadow to use. For custom shadow, pass a JSON-encoded shadow object or relative path to json file. Otherwise, pass "mss" or "atv2" to automatically generate a shadow that conforms to the nRF Cloud schema for the desired application.',
      handleAppType,
    )
    .option(
      '-p, --job-execution-path <jobExecutionPath>',
      'Specifies an unhappy job execution path for a FOTA update. View the "Use an unhappy path for FOTA execution" section of the README for more details.',
      handleJobExecution,
    )
    .option(
      '-q, --mqtt-team-device <mqttTeamDevice>',
      'Specifies that the device certificates you provided are for an MQTT Team Device (formerly known as an Account Device), which will auto-subscribe to topics for all devices in your team.',
      false,
    )
    .option('-v, --verbose', 'output debug info', false)
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
