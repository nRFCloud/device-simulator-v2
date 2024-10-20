import { ISensor } from '../../sensors/Sensor';
import { Service } from './Service';
import { AppMessage } from '../appMessage';
import { SendMessage } from '../../nrfDevice';

const APPID = 'DEVICE';

export class Device implements Service {
  constructor(
    private readonly sensor: ISensor,
    private readonly sendMessage: SendMessage,
  ) {}

  async start() {
    this.sensor.on('data', (timestamp: number, data) => {
      const message = <AppMessage>{
        appId: APPID,
        messageType: 'STATUS',
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
