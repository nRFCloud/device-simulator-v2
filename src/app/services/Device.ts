import { ISensor } from '../../sensors/Sensor';
import { Service } from './Service';
import { AppMessage, AppTimestreamMessage } from '../appMessage';
import { SendMessage } from '../../nrfDevice';

const APPID = 'DEVICE';

export class Device implements Service {
  constructor(
    private readonly sensor: ISensor,
    private readonly sendMessage: SendMessage,
    private readonly timestreamOptimized: boolean,
  ) {}

  async start() {
    this.sensor.on('data', (timestamp: number, rawData: any) => {
      const ts = Date.now();
      let message: AppMessage | AppTimestreamMessage;
      const data = String.fromCharCode.apply(null, rawData);

      if (this.timestreamOptimized) {
        message = <AppTimestreamMessage>{
          device: data,
          ts,
        };
      }
      else {
        message = <AppMessage>{
          appId: APPID,
          messageType: 'STATUS',
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

  async stop() {
    await this.sensor.stop();
  }
}
