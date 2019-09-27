import { cyan, red, yellow } from 'colors';
import * as path from 'path';
import { nrfdevice, DeviceConfig } from './nrfDevice';
import { ISensor } from './sensors/Sensor';
import { FakeGps } from './sensors/FakeGps';
import { FakeAccelerometer } from './sensors/FakeAccelerometer';
import { FakeThermometer } from './sensors/FakeThermometer';
import { FakeDevice } from './sensors/FakeDevice';

export type SimulatorConfig = {
  certsResponse: string;
  endpoint: string;
  appFwVersion: string;
  deviceId: string;
  mqttMessagesPrefix: string;
  services?: string;
};

export const simulator = async ({
  certsResponse,
  endpoint,
  appFwVersion,
  deviceId,
  mqttMessagesPrefix,
  services = '',
}: SimulatorConfig): Promise<void> => {
  if (!deviceId) {
    console.error(red('A device id is required!'));
    return;
  }

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

