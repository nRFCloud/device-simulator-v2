#!/usr/bin/env node
import { Option, program } from 'commander';
import { run, SimulatorConfig } from './index';
import { Log } from './models/Log';

const sensorOptions = ['gps', 'gnss', 'acc', 'temp', 'device', 'rsrp', 'location', 'log', 'alert'];
const getConfig = (env: any, args: string[]) =>
  program
    .requiredOption(
      '-k, --api-key <apiKey>',
      'nRF Cloud REST API Key. May be set with the API_KEY environment variable.',
      env.API_KEY,
    )
    .option(
      '-h, --api-host <apiHost>',
      'nRF Cloud API Host. May be set with the API_HOST environment variable.',
      env.API_HOST ? env.API_HOST : 'https://api.nrfcloud.com',
    )
    .option(
      '-d, --device-id <deviceId>',
      'ID of the device. May be set with the DEVICE_ID environment variable. If you pass a device ID, an attempt is made to find locally stored device credentials in an adjacent "credentials" folder that is auto-created for you. Otherwise, a new device is created and added to your team, with device credentials stored locally for easy reuse.',
      env.DEVICE_ID,
    )
    .addOption(
      new Option(
        '-t, --device-type <deviceType>',
        'Specifies the type of device you want created. In most cases you will use the default "Generic" device. An "MQTT Team" device is mainly for debugging, or for use in an MQTT bridge. See https://docs.nordicsemi.com for more information.',
      ).choices(['Generic', 'Team']).default('Generic'),
    )
    .addOption(
      new Option(
        '-c, --certificate-type <certificateType>',
        'Specifies the type of certificate you want created for your new device: self-signed certificate or one for Just-In-Time-Provisioning (JITP). The latter is discouraged, and is mainly for internal Nordic Semiconductor use.',
      ).choices(['Self-Signed', 'JITP']).default('Self-Signed'),
    )
    .option(
      '-p, --prevent-association',
      'Specifies that when your device with a Just-In-Time-Provisioning (JITP) certificate connects to the MQTT broker (before it is ever associated with your team), it should only connect, i.e., not get associated. This option is only applicable when the "-c jitp" option is specified and the device has not already been added to (associated with) your team. This is mainly for internal Nordic Semiconductor use to test JITP issues.',
      false,
    )
    .addOption(
      new Option(
        '-s, --sensors <sensors>',
        `A comma-separated list of sensors you want your device to simulate. Valid choices: ${
          sensorOptions.join(', ')
        }. See https://github.com/nRFCloud/application-protocols for more information about sensor messages.`,
      )
        .argParser((value) => {
          const values = value.split(',');
          values.forEach((val) => {
            if (!sensorOptions.includes(val)) {
              throw new Error(`Invalid choice: ${val}. Allowed choices are: ${sensorOptions.join(', ')}`);
            }
          });
          return values;
        })
        .default([]),
    )
    .option(
      '-f, --app-fw-version <appFwVersion>',
      'Version of the app firmware',
      '1',
    )
    .addOption(new Option(
      '-a, --app-type <appType>',
      'The type of shadow to initialize: `mss` for the nRF Cloud multi-service sample, or `atv2` for the Asset Tracker v2 application. For more info see the nRF Connect SDK docs at https://docs.nordicsemi.com.',
    ).choices(['mss', 'atv2']))
    .addOption(new Option(
      '-x, --job-execution-failure-scenario <jobExecutionFailureScenario>',
      'A job execution failure scenario during a FOTA update. View the "Simulate a FOTA Job Execution Failure Scenario" section of the README for more details.',
    ).choices(['0', '1', '2', '3', '4', '5']))
    .option('-v, --verbose', 'Show output debug info.', false)
    .parse(args)
    .opts();

let verbose: boolean;

(async (): Promise<void> => {
  const config = getConfig(process.env, process.argv);
  verbose = config.verbose;
  return run(config as SimulatorConfig);
})().catch((err) => new Log(verbose).error(err));
