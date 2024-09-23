import { SendMessage } from '../../nrfDevice';
import { ISensor } from '../../sensors/Sensor';
import { AppMessage } from '../appMessage';
import { Service } from './Service';

const APPID = ['MCELL', 'SCELL', 'WIFI'];

export class Location implements Service {
  constructor(
    private readonly sensor: ISensor,
    private readonly sendMessage: SendMessage,
  ) {}

  async start() {
    await this.sendHello();

    this.sensor.on('data', (timestamp: number, data: any) => {
      const message = <AppMessage> {
        appId: APPID[Math.floor(Math.random() * 100) % 3],
        messageType: 'DATA',
        data,
      };
      this.sendMessage(timestamp, message);
    });

    if (!this.sensor.isStarted()) {
      await this.sensor.start();
    }
  }

  private async sendHello() {
    await this.sendMessage(Date.now(), {
      appId: 'MCELL',
      messageType: 'HELLO',
    });
  }

  async stop() {
    await this.sensor.stop();
  }
}
