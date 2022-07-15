import { ISensor } from '../../sensors/Sensor';
import { AppMessage, AppTimestreamMessage } from '../appMessage';
import { SendMessage } from '../../nrfDevice';
import { Service } from './Service';

const APPID = 'TEMP';

export class Temp implements Service {
  constructor(
    private readonly sensor: ISensor,
    private readonly sendMessage: SendMessage,
    private readonly timestreamOptimized: boolean,
  ) {}

  async start() {
    await this.sendHello();
    this.sensor.on('data', (timestamp: number, rawData: any) => {
      const ts = Date.now();
      const data = String.fromCharCode.apply(null, rawData);
      let message: AppMessage | AppTimestreamMessage;
      if (this.timestreamOptimized) {
        message = <AppTimestreamMessage>{
          temp: { v: +data, ts },
        };
      }
      else {
        message = {
          appId: APPID,
          messageType: 'DATA',
          data,
          ts,
        };
      }

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
