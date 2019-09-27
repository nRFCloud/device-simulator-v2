#!/usr/bin/env node
import * as program from 'commander';
import { red } from 'colors';
import * as dotenv from 'dotenv';
import { simulator, SimulatorConfig } from './simulator';

dotenv.config();

program
  .option(
    '-cr, --certs-response <certsResponse>',
    'JSON returned by call to the Device API endpoint: POST /devices/{deviceid}/certificates',
    process.env.CERTS_RESPONSE,
  )
  .option(
    '-e, --endpoint <endpoint>',
    'AWS IoT MQTT endpoint',
    process.env.MQTT_ENDPOINT,
  )
  .option(
    '-a, --app-fw-version <appFwVersion>',
    'Version of the app firmware',
    1,
  )
  .option(
    '-m, --mqtt-messages-prefix <mqttMessagesPrefix>',
    'The prefix for the MQTT unique to this tenant for sending and receiving device messages',
    process.env.MQTT_MESSAGES_PREFIX,
  )
  .option(
    '-s, --services <services>',
    'Comma-delimited list of services to enable. Any of: [gps,acc,temp,device]',
  )
  .parse(process.argv);

simulator((program as unknown) as SimulatorConfig).catch(error => {
  process.stderr.write(`${red(error)}\n`);
});
