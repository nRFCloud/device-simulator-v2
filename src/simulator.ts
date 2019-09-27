import * as program from 'commander';
import { cyan, red, yellow } from 'colors';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { nrfdevice, DeviceConfig } from './nrfDevice';
import { ISensor } from './sensors/Sensor';
import { FakeGps } from './sensors/FakeGps';
import { FakeAccelerometer } from './sensors/FakeAccelerometer';
import { FakeThermometer } from './sensors/FakeThermometer';
import { FakeDevice } from './sensors/FakeDevice';

dotenv.config();

const simulator = async ({
  certsResponse,
  endpoint,
  appFwVersion,
  mqttMessagesPrefix,
  services,
}: program.Command) => {
  const certs = JSON.parse(certsResponse);
  const caCert = Buffer.from(certs.caCert, 'utf-8');
  const clientCert = Buffer.from(certs.clientCert, 'utf-8');
  const privateKey = Buffer.from(certs.privateKey, 'utf-8');

  const config: DeviceConfig = {
    deviceId: certs.clientId,
    caCert,
    privateKey,
    clientCert,
    endpoint,
    appFwVersion,
    mqttMessagesPrefix,
  };

  console.log(cyan(`connecting to ${yellow(endpoint)}...`));

  const sensors = new Map<string, ISensor>();
  if (services) {
    services.split(',').map((service: string) => {
      const sensorDataFilePath = (filename: string) =>
        path.resolve(__dirname, '..', 'data', 'sensors', filename);

      switch (service) {
        case 'gps':
          sensors.set(
            service,
            new FakeGps(sensorDataFilePath('gps-default.txt'), ['GPGGA'], true),
          );
          break;
        case 'acc':
          sensors.set(
            service,
            new FakeAccelerometer(
              sensorDataFilePath('accelerometer.txt'),
              true,
              1000,
            ),
          );
          break;
        case 'temp':
          sensors.set(
            service,
            new FakeThermometer(
              sensorDataFilePath('temperature.txt'),
              true,
              7000,
            ),
          );
          break;
        case 'device':
          sensors.set(
            service,
            new FakeDevice(sensorDataFilePath('device.txt'), true, 1000),
          );
          break;
      }
    });
  }

  nrfdevice(config, sensors);
};

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

simulator(program).catch(error => {
  process.stderr.write(`${red(error)}\n`);
});
