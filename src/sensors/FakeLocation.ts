import { EventEmitter } from 'events';
import { ISensor } from './Sensor';
import * as fs from 'fs';
import * as readline from 'readline';

export class FakeLocation extends EventEmitter implements ISensor {

	private readonly LocationSentences: string[] = [];
	private sentenceIndex: number = 0;
	private reader?: readline.ReadLine;
	private readStream?: fs.ReadStream;
	private started = false;
	private gpsEmitterIntervalId: any = null;

	constructor(
		private readonly locationReading: string,
		private readonly loop: boolean = false,
	) {
		super();
	}

	private readGPSData() {
		this.readStream = fs.createReadStream(this.locationReading);
		this.reader = readline.createInterface({
			input: this.readStream,
		});

		this.reader.on('line', line => {
			this.LocationSentences.push(line);
		});

		this.reader.on('close', () => {
			this.cleanUpAndStartEmitting();
		});
	}

	private emitGPSData() {
		console.log(Buffer.from(this.LocationSentences[this.sentenceIndex]));
		this.emit(
			'data',
			Date.now(),
			Buffer.from(this.LocationSentences[this.sentenceIndex]),
		);

		if (this.sentenceIndex === this.LocationSentences.length - 1) {
			if (this.loop) {
				this.sentenceIndex = 0;
			} else {
				this.stop();
			}
		} else {
			this.sentenceIndex++;
		}
	}

	async start(): Promise<void> {
		const fileExists = await new Promise(resolve =>
			fs.exists(this.locationReading, resolve),
		);

		if (!fileExists) {
			throw new Error(
				`Recording with filename '${this.locationReading}' does not exist.`,
			);
		}

		this.started = true;

		this.readGPSData();
	}

	private cleanUpAndStartEmitting() {
		if (this.reader) {
			this.reader.close();
		}

		if (this.readStream) {
			this.readStream.close();
		}

		if (this.LocationSentences) {
			this.gpsEmitterIntervalId = setInterval(() => {
				this.emitGPSData();
			}, 1000);
		}
	}

	stop() {
		clearInterval(this.gpsEmitterIntervalId);
		this.started = false;
		this.emit('stopped');
	}

	isStarted(): boolean {
		return this.started;
	}
}