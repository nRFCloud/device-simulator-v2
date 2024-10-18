#!/usr/bin/env node
import { Option, program } from 'commander';
import { run, SimulatorConfig } from './index';
import { Log } from './models/Log';

const getConfig = (env: any, args: string[]) =>
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
      '-d, --device-id <deviceId>',
      'ID of the device. If not set, a new device is created. If set, an attempt is made to find locally stored device credentials in an adjacent "credentials" folder that is auto-created for you. Otherwise, they are created automatically and stored there.',
      env.DEVICE_ID,
    )
    .addOption(
      new Option(
        '-t, --device-type <deviceType>',
        'Device type. In most cases you will use a generic device. MQTT Team devices are mainly for debugging and use in an MQTT bridge. See docs.nordicsemi.com for more information.',
      ).choices(['generic', 'team']).default('generic'),
    )
    .addOption(
      new Option(
        '-m, --connect-mode <connectMode>',
        'Specifies how you want to connect your device to nRF Cloud. Just-In-Time-Provisioning (JITP) options are discouraged, and mainly for internal Nordic Semiconductor use. MQTT Team devices are always onboarded.',
      ).choices(['onboard', 'jitp-associate', 'jitp-connect-only']).default('onboard'),
    )
    .addOption(new Option(
      '-s, --services <services>',
      'Comma-delimited list of services to enable.',
    ).choices(['gps', 'gnss', 'acc', 'temp', 'device', 'rsrp', 'location', 'log', 'alert']))
    .option(
      '-f, --app-fw-version <appFwVersion>',
      'Version of the app firmware',
      '1',
    )
    .addOption(new Option(
      '-a, --app-type <appType>',
      'Specifies the type of shadow to initialize based on the nRF Cloud schema: `mss` for the nRF Cloud multi-service sample, or `atv2` for the Asset Tracker v2 application. For more info see the nRF Connect SDK docs at docs.nordicsemi.com.',
    ).choices(['mss', 'atv2']))
    .addOption(new Option(
      '-p, --job-execution-failure-scenario <jobExecutionFailureScenario>',
      'Specifies a job execution failure scenario during a FOTA update. View the "Simulate a FOTA Job Execution Failure Scenario" section of the README for more details.',
    ).choices(['0', '1', '2', '3', '4', '5']))
    .option('-v, --verbose', 'output debug info', false)
    .parse(args)
    .opts();

let verbose: boolean;

(async (): Promise<void> => {
  const config = getConfig(process.env, process.argv);
  verbose = config.verbose;
  return run(config as SimulatorConfig);
})().catch((err) => new Log(verbose).error(err));
