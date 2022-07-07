import { ISensor } from '../../sensors/Sensor';
import { AppMessage } from '../appMessage';
import { SendMessage } from '../../nrfDevice';
import { Service } from './Service';

const APPID = ['MCELL', 'SCELL', 'CELL_POS', 'WIFI', 'GNSS'];


export class Location implements Service {
    constructor(
        private readonly sensor: ISensor,
        private readonly sendMessage: SendMessage,
    ) { }

    async start() {
        await this.sendHello();

        this.sensor.on('data', (timestamp: number, data: any) => {
            console.debug(data);
            const message = <AppMessage>{
                appId: APPID[Math.floor(Math.random() * 100) % 5], //Picks a random location service type to send
                messageType: 'DATA',
                data: data,
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
