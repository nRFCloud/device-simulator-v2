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
  certs,
  deviceId,
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
  const log = new Log(!!verbose);

  // try {
  //   certs = JSON.parse(certsAsJson);
  // } catch (err) {
  //   log.error(
  //     `ERROR: failed to parse certsAsJson: ${JSON.stringify(
  //       certsAsJson,
  //       null,
  //       2,
  //     )}`,
  //   );
  //   throw new Error(`Error parsing certsAsJson ${err} ${certsAsJson}`);
  // }
  console.log(certs)
  const AMAZON_ROOT_CA1_PEM =
  '-----BEGIN CERTIFICATE-----\nMIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF\nADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6\nb24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTEL\nMAkGA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJv\nb3QgQ0EgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALJ4gHHKeNXj\nca9HgFB0fW7Y14h29Jlo91ghYPl0hAEvrAIthtOgQ3pOsqTQNroBvo3bSMgHFzZM\n9O6II8c+6zf1tRn4SWiw3te5djgdYZ6k/oI2peVKVuRF4fn9tBb6dNqcmzU5L/qw\nIFAGbHrQgLKm+a/sRxmPUDgH3KKHOVj4utWp+UhnMJbulHheb4mjUcAwhmahRWa6\nVOujw5H5SNz/0egwLX0tdHA114gk957EWW67c4cX8jJGKLhD+rcdqsq08p8kDi1L\n93FcXmn/6pUCyziKrlA4b9v7LWIbxcceVOF34GfID5yHI9Y/QCB/IIDEgEw+OyQm\njgSubJrIqg0CAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMC\nAYYwHQYDVR0OBBYEFIQYzIU07LwMlJQuCFmcx7IQTgoIMA0GCSqGSIb3DQEBCwUA\nA4IBAQCY8jdaQZChGsV2USggNiMOruYou6r4lK5IpDB/G/wkjUu0yKGX9rbxenDI\nU5PMCCjjmCXPI6T53iHTfIUJrU6adTrCC2qJeHZERxhlbI1Bjjt/msv0tadQ1wUs\nN+gDS63pYaACbvXy8MWy7Vu33PqUXHeeE6V/Uq2V8viTO96LXFvKWlJbYK8U90vv\no/ufQJVtMVT8QtPHRh8jrdkPSHCa2XV4cdFyQzR1bldZwgJcJmApzyMZFo6IQ6XU\n5MsI+yMRQ+hDKXJioaldXgjUkK642M4UwtBV8ob2xJNDd2ZhwLnoQdeXeGADbkpy\nrqXRfboQnoZsG4q5WTP468SQvvG5\n-----END CERTIFICATE-----\n';
  const caCert = Buffer.from(process.env.ROOT_CA_CERT_PEM_PATH || AMAZON_ROOT_CA1_PEM, 'utf-8');
  // const clientCert = Buffer.from(process.env.DEVICE_CERT_PEM_PATH!!, 'utf-8');
  // const privateKey = Buffer.from(process.env.DEVICE_KEY_PEM_PATH!!, 'utf-8');
  const clientCert = process.env.DEVICE_CERT_PEM_PATH!!;
  const privateKey = process.env.DEVICE_KEY_PEM_PATH!!;

  const config: DeviceConfig = {
    deviceId,
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
