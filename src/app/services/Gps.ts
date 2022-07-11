import { ISensor } from '../../sensors/Sensor';
import { AppMessage } from '../appMessage';
import { SendMessage } from '../../nrfDevice';
import { Service } from './Service';

const APPID = 'GNSS';
const GPS_SEND_INTERVAL = 10000;

export class Gps implements Service {
  lastGpsSend = 0;

  constructor(
    private readonly sensor: ISensor,
    private readonly sendMessage: SendMessage,
  ) { }

  async start() {
    await this.sendHello();

    this.sensor.on('data', (timestamp: number, data: any) => {
      console.debug(data);
      if (Date.now() >= this.lastGpsSend + GPS_SEND_INTERVAL) {
        const message = <AppMessage>{
          appId: APPID,
          messageType: 'DATA',
          data: String.fromCharCode.apply(null, data),
        };
        this.sendMessage(timestamp, message);
        this.lastGpsSend = Date.now();
      }
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
