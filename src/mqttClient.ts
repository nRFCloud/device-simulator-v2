import { device } from 'aws-iot-device-sdk';

export const mqttClient = ({
  caCert,
  clientCert,
  privateKey,
  id,
  endpoint,
}: {
  caCert: Buffer | string;
  clientCert: Buffer | string;
  privateKey: Buffer | string;
  id: string;
  endpoint: string;
}) =>
  new device({
    privateKey,
    clientCert,
    caCert,
    clientId: id,
    host: endpoint,
    region: endpoint.split('.')[2],
    debug: false,
  });
