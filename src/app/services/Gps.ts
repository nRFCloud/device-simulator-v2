import { ISensor } from '../../sensors/Sensor';
import { AppMessage, AppTimestreamMessage } from '../appMessage';
import { SendMessage } from '../../nrfDevice';
import { Service } from './Service';
const GPS = require('gps');

const APPID = 'GPS';
const GPS_SEND_INTERVAL = 10000;

interface ParsedGPS {
  lat: number;
  lon: number;
}

export class Gps implements Service {
  lastGpsSend = 0;

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

      if (ts >= this.lastGpsSend + GPS_SEND_INTERVAL) {
        if (this.timestreamOptimized) {
          const gps = new GPS;
          gps.on('data', (({ lat, lon }: ParsedGPS) => {
            this.sendMessage(timestamp, <AppTimestreamMessage>{
              lat_lon: [lat, lon],
              ts,
            });
          }));
          gps.update(data);
        }
        else {
          this.sendMessage(timestamp, <AppMessage>{
            appId: APPID,
            messageType: 'DATA',
            data,
            ts,
          });
        }
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
