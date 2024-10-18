import { cyan, dim, green, magenta, red, yellow } from 'colors';

type BasicLogHandler = (message: string) => void;
type DeviceTrafficHandler = (topic: string, payload: any) => void;
type Label = string;
type Message = string;
type MessageEntry = [Label, Message];

export interface Logger {
  error: BasicLogHandler;
  info: BasicLogHandler;
  success: BasicLogHandler;
  debug: BasicLogHandler;
  outgoing: DeviceTrafficHandler;
  incoming: DeviceTrafficHandler;
  prettify: (header: string, body: MessageEntry[]) => string;
}

export class Log implements Logger {
  constructor(private readonly verbose: boolean) {}
  error(message: string) {
    this.log(red(message));
  }
  info(message: string) {
    this.log(yellow(message));
  }
  success(message: string) {
    this.log(green(message));
  }
  debug(message: string) {
    this.verbose && this.log(dim(message));
  }
  outgoing(topic: string, payload: any) {
    this.log(cyan(this.prettify(
      'MESSAGE SENT',
      [
        ['TOPIC', topic],
        ['MESSAGE', this.prettyPayload(payload)],
      ],
    )));
  }
  incoming(topic: string, payload: any) {
    this.log(magenta(this.prettify(
      'MESSAGE RECEIVED',
      [
        ['TOPIC', topic],
        ['MESSAGE', this.prettyPayload(payload)],
      ],
    )));
  }
  prettify(header: string, body: MessageEntry[]): string {
    return `
======================= ${header} =======================
${body.map(([key, val]) => `${key?.length ? `${key}: ${val}` : ''}`).join('\n')}
=======================${'='.repeat(header.length + 2)}=======================
`;
  }
  private log(coloredMessage: string) {
    console.log(`${coloredMessage}\n`);
  }
  private prettyPayload(payload: object | string | Buffer): string {
    const isBuffer = (payload as Buffer)?.buffer;

    try {
      if (isBuffer) {
        const bufStr = payload.toString();
        const parsed = JSON.parse(bufStr);
        return JSON.stringify(parsed, null, 2);
      }

      return JSON.stringify(payload, null, 2);
    } catch (err) {
      this.debug(`Error unwrapping payload. Error: "${err}". Payload: ${payload}`);
      // squelch error, this tells us payload is not valid JSON, just return payload
      return isBuffer ? (payload as Buffer).toString() : payload as string;
    }
  }
}
