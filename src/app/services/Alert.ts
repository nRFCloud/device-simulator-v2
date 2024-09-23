import { SendMessage } from '../../nrfDevice';
import { ISensor } from '../../sensors/Sensor';
import { AppMessage } from '../appMessage';
import { Service } from './Service';

const APPID = 'ALERT';

export class Alert implements Service {
  constructor(
    private readonly sensor: ISensor,
    private readonly sendMessage: SendMessage,
  ) {}

  async start() {
    await this.sendHello();

    this.sensor.on('data', (timestamp: number, data: any) => {
      const message = <AppMessage> {
        appId: APPID,
        messageType: 'DATA',
        ts: new Date().getTime(),
        ...data,
      };
      this.sendMessage(timestamp, message);
    });

    if (!this.sensor.isStarted()) {
      await this.sensor.start();
    }
  }
  private async sendHello() {
    await this.sendMessage(Date.now(), {
      appId: APPID,
      messageType: 'HELLO',
    });
  }
  async stop() {
    await this.sensor.stop();
  }
}
