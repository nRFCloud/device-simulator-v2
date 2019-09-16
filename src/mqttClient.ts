import * as path from 'path';
import { device } from 'aws-iot-device-sdk';

export const mqttClient = ({
  id,
  endpoint,
  key,
  certificate,
}: {
  certificate: string;
  key: string;
  id: string;
  endpoint: string;
}) =>
  new device({
    privateKey: key,
    clientCert: certificate,
    caCert: path.resolve(__dirname, '..', 'data', 'AmazonRootCA1.pem'),
    clientId: id,
    host: endpoint,
    region: endpoint.split('.')[2],
    debug: false,
  });
