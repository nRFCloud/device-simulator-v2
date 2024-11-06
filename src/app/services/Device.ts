import { SendMessage } from '../../nrfDevice';
import { ISensor } from '../../sensors/Sensor';
import { AppMessage } from '../appMessage';
import { Service } from './Service';

const APPID = 'DEVICE';

export class Device implements Service {
  messageId = 1;

  constructor(
    private readonly sensor: ISensor,
    private readonly sendMessage: SendMessage,
  ) {}

  async start() {
    this.sensor.on('data', (timestamp: number, data) => {
      const message = <AppMessage> {
        appId: APPID,
        messageType: 'STATUS',
        messageId: this.messageId++,
        // @ts-ignore
        data: String.fromCharCode.apply(null, data),
      };
      this.sendMessage(timestamp, message);
    });

    if (!this.sensor.isStarted()) {
      await this.sensor.start();
    }
  }

  async stop() {
    await this.sensor.stop();
  }
}
