import { device } from 'aws-iot-device-sdk';
// seconds; see https://docs.aws.amazon.com/general/latest/gr/iot-core.html#iot-protocol-limits.
// At 1.5x the keep-alive AWS will publish a "disconnected" life-cycle event:
// https://docs.aws.amazon.com/iot/latest/developerguide/life-cycle-events.html.
export const KEEP_ALIVE = 30;
export const mqttClient = ({
  caCert,
  clientCert,
  privateKey,
  id,
  mqttEndpoint,
}: {
  caCert: Buffer | string;
  clientCert: Buffer | string;
  privateKey: Buffer | string;
  id: string;
  mqttEndpoint: string;
}): device =>
  new device({
    privateKey,
    clientCert,
    caCert,
    clientId: id,
    host: mqttEndpoint,
    debug: false,
    keepalive: KEEP_ALIVE,
    // A "clean session" is non-persistent, i.e. after connecting, the new session is a "clean slate", and any QoS 1 or
    // 2 messages sent to *previously subscribed topics* while the device is offline will be discarded from the broker's queue.
    // If you really want to connect in a way that disallows receiving QoS 1 and 2 messages that were published while the
    // client was offline, set clean to true.
    clean: false,
    // Uncomment if you want to support Last Will and Testament messages. However, you
    // will need to add a publish permission to your IoT device policy for the topic.
    // will: {
    //   topic: `presence/${id}/lwt`,
    //   payload: '"LWT"', // Must be a valid JSON string, which requires double quotes
    //   qos: 0,
    // }
  });
