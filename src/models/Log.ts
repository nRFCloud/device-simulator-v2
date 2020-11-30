import { red, yellow, green, dim, magenta, cyan } from 'colors';

type BasicLogHandler = (message: string) => void;
type DeviceTrafficHandler = (topic: string, payload: any) => void;

export interface Logger {
  error: BasicLogHandler;
  info: BasicLogHandler;
  success: BasicLogHandler;
  debug: BasicLogHandler;
  outgoing: DeviceTrafficHandler;
  incoming: DeviceTrafficHandler;
}

export class Log implements Logger {
  constructor(private readonly verbose: boolean) {}
  error(message: string) { console.log(red(message)); }
  info(message: string) { console.log(yellow(message)); }
  success(message: string) { console.log(green(message)); }
  debug(message: string) { this.verbose && console.log(dim(message)); }
  outgoing(topic: string, payload: any) {
    console.log(cyan(`
************** MESSAGE SENT ***********
TOPIC: ${topic}
MESSAGE: ${JSON.stringify(payload, null, 2)}
***************************************

`));
  }
  incoming(topic: string, payload: any) {
    console.log(magenta(`
************** MESSAGE RECEIVED *******
TOPIC: ${topic}
MESSAGE: ${JSON.stringify(payload, null, 2)}
***************************************

`));
  }
}
