import { SendMessage } from '../../nrfDevice';
import { ISensor } from '../../sensors/Sensor';
import { AppMessage } from '../appMessage';
import { Service } from './Service';

export class Gnss implements Service {
  messageId = 1;

  constructor(
    private readonly sensor: ISensor,
    private readonly sendMessage: SendMessage,
  ) {}

  async start() {
    this.sensor.on('data', (timestamp: number, data: any) => {
      const message = <AppMessage> {
        appId: 'GNSS',
        messageType: 'DATA',
        messageId: this.messageId++,
        data,
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
