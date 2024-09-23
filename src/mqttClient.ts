import { device } from "aws-iot-device-sdk";
// seconds; see https://docs.aws.amazon.com/general/latest/gr/iot-core.html#iot-protocol-limits.
// At 1.5x the keep-alive AWS will publish a "disconnected" life-cycle event:
// https://docs.aws.amazon.com/iot/latest/developerguide/life-cycle-events.html.
export const KEEP_ALIVE = 30;
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
}): device =>
  new device({
    privateKey,
    clientCert,
    caCert,
    clientId: id,
    host: endpoint,
    debug: false,
    keepalive: KEEP_ALIVE,
    clean: false,
    // Uncomment if you want to support Last Will and Testament messages. However, you
    // will need to add a publish permission to your IoT device policy for the topic.
    // will: {
    //   topic: `presence/${id}/lwt`,
    //   payload: '"LWT"', // Must be a valid JSON string, which requires double quotes
    //   qos: 0,
    //   retain: false, // Don't use true. See https://github.com/aws/aws-iot-device-sdk-js/issues/61
    // }
  });
