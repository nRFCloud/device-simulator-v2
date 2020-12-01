import { red, yellow, green, dim, magenta, cyan } from 'colors';

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
  prettify: (header: string, body: MessageEntry[])  => string,
}

const prettyMessage = (header: string, body: MessageEntry[]): string => `
************** ${header} ***********
${body.map(([key, val]) => `${key}: ${val}`).join('\n')}
**************${'*'.repeat(header.length + 2)}***********
`;

export class Log implements Logger {
  constructor(private readonly verbose: boolean) {}
  error(message: string) { console.log(red(message)); }
  info(message: string) { console.log(yellow(message)); }
  success(message: string) { console.log(green(message)); }
  debug(message: string) { this.verbose && console.log(dim(message)); }
  outgoing(topic: string, payload: any) {
    console.log(cyan(prettyMessage(
        'MESSAGE SENT', [
          ['TOPIC', topic],
          ['MESSAGE', JSON.stringify(payload, null, 2)],
        ]),
      ),
    );
  }
  incoming(topic: string, payload: any) {
    console.log(magenta(prettyMessage(
        'MESSAGE RECEIVED', [
          ['TOPIC', topic],
          ['MESSAGE', JSON.stringify(payload, null, 2)],
        ]),
      ),
    );
  }
  prettify(header: string, body: MessageEntry[]): string {
    return prettyMessage(header, body);
  }
}
