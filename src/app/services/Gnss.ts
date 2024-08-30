import { ISensor } from '../../sensors/Sensor';
import { AppMessage } from '../appMessage';
import { SendMessage } from '../../nrfDevice';
import { Service } from './Service';

export class Gnss implements Service {
	constructor(
		private readonly sensor: ISensor,
		private readonly sendMessage: SendMessage,
	) { }

	async start() {

		this.sensor.on('data', (timestamp: number, data: any) => {
			const message = <AppMessage>{
				appId: 'GNSS',
				messageType: 'DATA',
				data: data,
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
