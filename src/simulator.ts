import * as path from 'path';

import { nrfdevice } from './nrfDevice';
import { DeviceConfig } from './models/Device';
import { ISensor } from './sensors/Sensor';
import { FakeGps } from './sensors/FakeGps';
import { FakeAccelerometer } from './sensors/FakeAccelerometer';
import { FakeThermometer } from './sensors/FakeThermometer';
import { FakeDevice } from './sensors/FakeDevice';
import { SimulatorConfig, getConn } from './index';
import { Log } from './models/Log';

export const simulator = async ({
  certsResponse,
  endpoint,
  appFwVersion,
  mqttMessagesPrefix,
  services = '',
  onConnect,
  stage,
  tenantId,
  verbose,
  apiHost,
  apiKey,
}: SimulatorConfig): Promise<void> => {
  let certs;
  const log = new Log(!!verbose);

  try {
    certs = JSON.parse(certsResponse);
  } catch (err) {
    log.error(
      `ERROR: failed to parse certsResponse: ${JSON.stringify(
        certsResponse,
        null,
        2,
      )}`,
    );
    throw new Error(`Error parsing certsResponse ${err} ${certsResponse}`);
  }

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
    stage,
    tenantId,
  };

  const sensors = new Map<string, ISensor>();

  if (services) {
    services.split(',').map((service: string) => {
      const sensorDataFilePath = (filename: string) =>
        path.resolve(__dirname, 'data', 'sensors', filename);

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

  nrfdevice(
    config,
    sensors,
    getConn(apiHost!, apiKey!, !!verbose),
    onConnect,
    log,
  );
};
