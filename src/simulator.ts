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
  deviceId,
  certificate,
  key,
  endpoint,
  appFwVersion,
  mqttMessagesPrefix,
  services,
}: program.Command) => {
  if (!deviceId) {
    console.error(red('A device id is required!'));
    return;
  }

  if (certsResponse) {
    const config = JSON.parse(certsResponse);
    key = Buffer.from(config.privateKey, 'utf-8');
    certificate = Buffer.from(config.certificate, 'utf-8');
  } else {
    key = path.resolve(key);
    certificate = path.resolve(certificate);
  }

  const config: DeviceConfig = {
    deviceId,
    key,
    certificate,
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
    '-d, --deviceId <deviceId>',
    'id of the device',
    process.env.DEVICE_ID,
  )
  .option(
    '-c, --certificate <certificate>',
    'location of the device certificate',
    process.env.DEVICE_CERTIFICATE,
  )
  .option(
    '-k, --key <key>',
    'location of the device private key',
    process.env.DEVICE_KEY,
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
