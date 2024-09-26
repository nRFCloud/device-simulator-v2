import * as path from 'path';

import { SimulatorConfig } from './index';
import { DeviceConfig } from './models/Device';
import { Log } from './models/Log';
import { nrfDevice } from './nrfDevice';
import { FakeAccelerometer } from './sensors/FakeAccelerometer';
import { FakeAlert } from './sensors/FakeAlert';
import { FakeDevice } from './sensors/FakeDevice';
import { FakeGnss } from './sensors/FakeGnss';
import { FakeGps } from './sensors/FakeGps';
import { FakeLocation } from './sensors/FakeLocation';
import { FakeLog } from './sensors/FakeLog';
import { FakeRsrp } from './sensors/FakeRsrp';
import { FakeThermometer } from './sensors/FakeThermometer';
import { ISensor } from './sensors/Sensor';

export const simulator = async ({
  deviceId,
  mqttEndpoint,
  appFwVersion,
  mqttMessagesPrefix,
  services = '',
  onConnect,
  stage,
  teamId,
  verbose,
  apiHost,
  apiKey,
  appType,
  jobExecutionPath,
  mqttTeamDevice,
}: SimulatorConfig): Promise<void> => {
  const log = new Log(!!verbose);

  const config: DeviceConfig = {
    deviceId,
    mqttEndpoint,
    appFwVersion,
    appType,
    mqttMessagesPrefix,
    stage,
    teamId,
    jobExecutionPath,
    mqttTeamDevice,
  };

  const sensors = new Map<string, ISensor>();

  if (services) {
    services.split(',').map((service: string) => {
      const sensorDataFilePath = (filename: string) => path.resolve(__dirname, 'data', 'sensors', filename);

      switch (service) {
        case 'gps':
          sensors.set(
            service,
            new FakeGps(sensorDataFilePath('gps-default.txt'), ['GPGGA'], true),
          );
          break;
        case 'location':
          sensors.set(
            service,
            new FakeLocation(sensorDataFilePath('location.txt'), true, 10000),
          );
          break;
        case 'gnss':
          sensors.set(
            service,
            new FakeGnss(sensorDataFilePath('gnss.json'), true, 10000),
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
            new FakeDevice(sensorDataFilePath('device.txt'), true, 5000),
          );
          break;
        case 'rsrp':
          sensors.set(
            service,
            new FakeRsrp(sensorDataFilePath('rsrp.txt'), true, 20000),
          );
          break;
        case 'log':
          sensors.set(
            service,
            new FakeLog(sensorDataFilePath('log.json'), true, 5000),
          );
          break;
        case 'alert':
          sensors.set(
            service,
            new FakeAlert(sensorDataFilePath('alert.json'), true, 10000),
          );
          break;
      }
    });
  }

  nrfDevice(
    config,
    sensors,
    onConnect,
    log,
  );
};
